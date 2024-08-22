const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "lobby.html"));
});

app.get("/Room", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

io.on("connection", (socket) => {
  let room;

  function sendMsg(msg) {
    io.to(room).emit("message", msg);
  }

  socket.on("join", roomId => {
    room = roomId;
    socket.join(room);
  })
  socket.on("notify-joined", sendMsg);
  socket.on("setup-peer", sendMsg);
  socket.on("sdp", sendMsg);
  socket.on("ice", sendMsg);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log("Server is running on port " + PORT)
);