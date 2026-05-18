const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// The Server's Memory
let gameData = {
    players: [],
    stories: []
};

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
            #submit-section { display: none; }
        </style>
    </head>
    <body>
        <h1>STORY WARZ</h1>

        <div id="join-section">
            <input id="playerName" type="text" placeholder="Enter Your Name">
            <button onclick="joinGame()">JOIN LOBBY</button>
        </div>

        <div id="submit-section">
            <h3>Submit 3 to 5 Stories</h3>
            <input id="s1" type="text" placeholder="Story 1 (Required)">
            <input id="s2" type="text" placeholder="Story 2 (Required)">
            <input id="s3" type="text" placeholder="Story 3 (Required)">
            <input id="s4" type="text" placeholder="Story 4 (Optional)">
            <input id="s5" type="text" placeholder="Story 5 (Optional)">
            <button onclick="submitStories()">LOCK IN STORIES</button>
        </div>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
            let myName = "";

            function joinGame() {
                myName = document.getElementById('playerName').value;
                if(myName) {
                    socket.emit('player_join', { name: myName });
                    // Hide the join button, show the story inputs
                    document.getElementById('join-section').style.display = 'none';
                    document.getElementById('submit-section').style.display = 'block';
                }
            }

            function submitStories() {
                const stories = [
                    document.getElementById('s1').value,
                    document.getElementById('s2').value,
                    document.getElementById('s3').value,
                    document.getElementById('s4').value,
                    document.getElementById('s5').value
                ];
                socket.emit('submit_stories', { name: myName, stories: stories });
                document.getElementById('submit-section').innerHTML = "<h3>Stories locked in! Look at the TV.</h3>";
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
            .player-row { margin: 10px 0; }
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
                if(lobbyDiv.innerHTML.includes("Waiting for players...")) { lobbyDiv.innerHTML = ""; }
                
                // Add player with an hourglass icon while they type
                lobbyDiv.innerHTML += "<div id='player-" + data.name + "' class='player-row'>" + data.name + " ⏳ Writing...</div>";
            });

            socket.on('player_submitted', function(data) {
                // Change their icon to a green checkmark when they finish
                const playerDiv = document.getElementById('player-' + data.name);
                if(playerDiv) {
                    playerDiv.innerHTML = data.name + " ✅ READY";
                }
            });
        </script>
    </body>
    </html>
  `);
});

// 3. The Real-Time Brain
io.on('connection', (socket) => {
  console.log("A user connected");
  
  socket.on('player_join', (data) => {
    gameData.players.push(data.name);
    io.emit('update_lobby', { name: data.name });
  });

  socket.on('submit_stories', (data) => {
    // Loop through the 5 inputs, ignore the blank ones, and save the rest
    data.stories.forEach(story => {
        if(story.trim() !== "") {
            gameData.stories.push({ author: data.name, text: story, read: false });
        }
    });
    
    io.emit('player_submitted', { name: data.name });
    console.log("Total Stories in Bank:", gameData.stories.length);
  });
});

const port = process.env.PORT || 3000;
http.listen(port, () => {
  console.log('Server running on port ' + port);
});
