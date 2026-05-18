const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// 1. Deliver the Player Screen (Phones)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Story Warz - Player</title>
        <style>
            body { background: #121212; color: white; font-family: sans-serif; text-align: center; padding: 20px; }
            input, button { width: 80%; padding: 15px; margin: 10px; font-size: 16px; border-radius: 8px; border: none; }
            button { background: #ff4444; color: white; font-weight: bold; }
        </style>
    </head>
    <body>
        <h1>STORY WARZ</h1>
        <input id="playerName" type="text" placeholder="Enter Your Name">
        <button onclick="joinGame()">JOIN LOBBY</button>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
            function joinGame() {
                const name = document.getElementById('playerName').value;
                if(name) {
                    socket.emit('player_join', { name: name });
                    alert("Joined! Check the TV screen.");
                }
            }
        </script>
    </body>
    </html>
  `);
});

// 2. Deliver the TV Screen
app.get('/tv', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Story Warz - TV</title>
        <style>
            body { background: #1a1a1a; color: white; font-family: sans-serif; text-align: center; padding: 50px; }
            h1 { color: #ff4444; font-size: 50px; }
            #lobby { font-size: 24px; background: #2a2a2a; padding: 20px; border-radius: 10px; display: inline-block; min-width: 300px; }
        </style>
    </head>
    <body>
        <h1>STORY WARZ</h1>
        <h2>Players In Lobby:</h2>
        <div id="lobby">Waiting for players...</div>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
            socket.on('update_lobby', function(data) {
                const lobbyDiv = document.getElementById('lobby');
                if(lobbyDiv.innerHTML === "Waiting for players...") { lobbyDiv.innerHTML = ""; }
                lobbyDiv.innerHTML += "<div>" + data.name + " ✅</div>";
            });
        </script>
    </body>
    </html>
  `);
});

io.on('connection', (socket) => {
  console.log("A user connected");
  socket.on('player_join', (data) => {
    io.emit('update_lobby', { name: data.name });
  });
});

const port = process.env.PORT || 3000;
http.listen(port, () => {
  console.log('Server running on port ' + port);
});
