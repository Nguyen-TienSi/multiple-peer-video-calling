const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const roomId = urlParams.get("room");
const localDisplayName = urlParams.get("name");

if (!roomId || !localDisplayName) {
  window.location = "lobby.html";
}

document.addEventListener("DOMContentLoaded", start);

const socket = io();
let localUuid;
let localStream;
let peerConnection = {};

const cameraBtn = document.querySelector("#controlBtn button:nth-child(1)");
const micBtn = document.querySelector("#controlBtn button:nth-child(2)");
const leaveBtn = document.querySelector("#controlBtn button:nth-child(3)");

cameraBtn.addEventListener("click", toggleCamera);
micBtn.addEventListener("click", toggleMic);
leaveBtn.addEventListener("click", leaveCall);

const peerConnectionConfig = {
  iceServers: [
    { urls: "stun:stun.stunprotocol.org:3478" },
    { urls: "stun:stun.l.google.com:19302" },
  ],
};

function start() {
  localUuid = createUUID();

  const constraints = {
    video: {
      width: { max: 320 },
      height: { max: 240 },
      frameRate: { max: 30 },
    },
    audio: {
      autoGainControl: false,
      echoCancellation: false,
      noiseSuppression: false,
      volume: 1.0
    },
  };

  navigator.mediaDevices
    .getUserMedia(constraints)
    .then((stream) => {
      document.querySelector(".videoContainer video").srcObject = stream;
      document
        .querySelector(".videoContainer")
        .appendChild(makeLabel(localDisplayName));
      localStream = stream;
    })
    .catch(errorHandler)
    .then(() => {
      socket.on("message", getMessage);
      socket.emit("join", roomId);
      socket.emit("notify-joined", {
        displayName: localDisplayName,
        uuid: localUuid,
        dest: "all",
      });
    });
}

function getMessage(msg) {
  const remoteUuid = msg.uuid;

  if (remoteUuid == localUuid || (msg.dest != localUuid && msg.dest != "all"))
    return;

  if (msg.displayName && msg.dest == "all") {
    setUpPeer(remoteUuid, msg.displayName);
    socket.emit("setup-peer", {
      displayName: localDisplayName,
      uuid: localUuid,
      dest: remoteUuid,
    });
  } else if (msg.displayName && msg.dest == localUuid) {
    setUpPeer(remoteUuid, msg.displayName, true);
  } else if (msg.sdp) {
    peerConnection[remoteUuid].pc
      .setRemoteDescription(new RTCSessionDescription(msg.sdp))
      .then(() => {
        if (msg.sdp.type == "offer") {
          peerConnection[remoteUuid].pc
            .createAnswer()
            .then((description) => createDescription(description, remoteUuid))
            .catch(errorHandler);
        }
      });
  } else if (msg.ice) {
    peerConnection[remoteUuid].pc
      .addIceCandidate(new RTCIceCandidate(msg.ice))
      .catch(errorHandler);
  }
}

function setUpPeer(remoteUuid, displayName, initCall = false) {
  peerConnection[remoteUuid] = {
    displayName: displayName,
    pc: new RTCPeerConnection(peerConnectionConfig),
  };
  peerConnection[remoteUuid].pc.onicecandidate = (event) =>
    getIceCandidate(event, remoteUuid);
  peerConnection[remoteUuid].pc.ontrack = (event) =>
    createVideo(event.streams[0], remoteUuid);
  peerConnection[remoteUuid].pc.oniceconnectionstatechange = (event) =>
    handleDisconnection(event, remoteUuid);
  peerConnection[remoteUuid].pc.addStream(localStream);

  if (initCall) {
    peerConnection[remoteUuid].pc
      .createOffer()
      .then((description) => createDescription(description, remoteUuid))
      .catch(errorHandler);
  }
}

function getIceCandidate(event, remoteUuid) {
  if (event.candidate != null) {
    socket.emit("ice", {
      ice: event.candidate,
      uuid: localUuid,
      dest: remoteUuid,
    });
  }
}

function createDescription(description, remoteUuid) {
  peerConnection[remoteUuid].pc.setLocalDescription(description).then(() => {
    socket.emit("sdp", {
      sdp: peerConnection[remoteUuid].pc.localDescription,
      uuid: localUuid,
      dest: remoteUuid,
    });
  });
}

function handleDisconnection(event, remoteUuid) {
  const state = peerConnection[remoteUuid].pc.iceConnectionState;
  if (state === "failed" || state === "closed" || state === "disconnected") {
    delete peerConnection[remoteUuid];
    document
      .getElementById("video-grid")
      .removeChild(document.getElementById(`${remoteUuid}`));
  }
}

function createUUID() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  }

  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function createVideo(stream, remoteUuid) {
  if (document.getElementById(`${remoteUuid}`)) return;

  const video = document.createElement("video");
  video.autoplay = true;
  video.srcObject = stream;

  const videoContainer = document.createElement("div");
  videoContainer.setAttribute("id", `${remoteUuid}`);
  videoContainer.classList.add("videoContainer");
  videoContainer.appendChild(video);
  videoContainer.appendChild(makeLabel(peerConnection[remoteUuid].displayName));

  document.getElementById("video-grid").appendChild(videoContainer);
}

function makeLabel(label) {
  const videoLabel = document.createElement("div");
  videoLabel.appendChild(document.createTextNode(label));
  videoLabel.classList.add("videoLabel");
  return videoLabel;
}

function errorHandler(error) {
  console.log(error);
}

function toggleCamera() {
  let videoTrack = localStream.getVideoTracks()[0];
  videoTrack.enabled = !videoTrack.enabled;
  if (videoTrack.enabled) {
    cameraBtn.textContent = "Tắt camera";
  } else {
    cameraBtn.textContent = "Mở camera";
  }
}

function toggleMic() {
  let audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  let micIcon = document.getElementById("micIcon");

  if (audioTrack.enabled) {
    micIcon.style.display = "none";
    micBtn.textContent = "Tắt mic";
  } else {
    micIcon.style.display = "block";
    micBtn.textContent = "Mở mic";
  }
}

function leaveCall() {
  localStream.getTracks().forEach((track) => track.stop());
  window.location = "lobby.html";
}
