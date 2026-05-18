const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// The Server's Memory
let gameData = {
    players: [],
    stories: [],
    currentStory: null,
    votes: []
};

// 1. Deliver the Player Screen
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
            button { background: #ff4444; color: white; font-weight: bold; cursor: pointer; }
            .vote-btn { background: #4444ff; margin: 5px; width: 90%; }
            #submit-section, #waiting-section, #voting-section { display: none; }
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
        
        <div id="waiting-section">
            <h3 id="wait-text">Stories locked in! Look at the TV.</h3>
        </div>

        <div id="voting-section">
            <h3>Who wrote this?</h3>
            <div id="vote-buttons"></div>
        </div>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
            let myName = "";

            function joinGame() {
                myName = document.getElementById('playerName').value;
                if(myName) {
                    socket.emit('player_join', { name: myName });
                    document.getElementById('join-section').style.display = 'none';
                    document.getElementById('submit-section').style.display = 'block';
                }
            }

            function submitStories() {
                const stories = [
                    document.getElementById('s1').value, document.getElementById('s2').value,
                    document.getElementById('s3').value, document.getElementById('s4').value,
                    document.getElementById('s5').value
                ];
                socket.emit('submit_stories', { name: myName, stories: stories });
                document.getElementById('submit-section').style.display = 'none';
                document.getElementById('waiting-section').style.display = 'block';
            }

            // When the TV shows a story, turn the phone into a voting pad
            socket.on('display_new_story', function(data) {
                document.getElementById('waiting-section').style.display = 'none';
                document.getElementById('voting-section').style.display = 'block';
                
                let btnsHTML = "";
                data.players.forEach(p => {
                    btnsHTML += "<button class='vote-btn' onclick='castVote(\\"" + p + "\\")'>" + p + "</button><br>";
                });
                document.getElementById('vote-buttons').innerHTML = btnsHTML;
            });

            function castVote(guess) {
                socket.emit('cast_vote', { voter: myName, guess: guess });
                document.getElementById('voting-section').style.display = 'none';
                document.getElementById('waiting-section').style.display = 'block';
                document.getElementById('wait-text').innerText = "Vote locked in!";
            }

            // If the host hits reset, reload the page
            socket.on('game_reset', () => { window.location.reload(); });
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
            h1 { color: #ff4444; font-size: 50px; margin-bottom: 10px; }
            #lobby { font-size: 24px; background: #2a2a2a; padding: 20px; border-radius: 10px; display: inline-block; min-width: 300px; }
            .player-row { margin: 10px 0; }
            #story-board { display: none; font-size: 32px; background: #333; padding: 40px; border-radius: 15px; margin-top: 30px; line-height: 1.5; }
            #live-feed { margin-top: 30px; font-size: 24px; color: #ffaa00; text-align: left; display: inline-block; }
            .vote-entry { margin: 10px 0; background: #222; padding: 10px 20px; border-radius: 8px; border-left: 5px solid #ffaa00; }
        </style>
    </head>
    <body>
        <h1>STORY WARZ</h1>
        
        <div id="lobby-container">
            <h2>Players In Lobby:</h2>
            <div id="lobby">Waiting for players...</div>
        </div>

        <div id="story-board"></div>
        <div id="live-feed"></div>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
            
            socket.on('update_lobby', function(data) {
                const lobbyDiv = document.getElementById('lobby');
                if(lobbyDiv.innerHTML.includes("Waiting for players...")) { lobbyDiv.innerHTML = ""; }
                if(!document.getElementById('player-' + data.name)) {
                    lobbyDiv.innerHTML += "<div id='player-" + data.name + "' class='player-row'>" + data.name + " ⏳ Writing...</div>";
                }
            });

            socket.on('player_submitted', function(data) {
                const playerDiv = document.getElementById('player-' + data.name);
                if(playerDiv) { playerDiv.innerHTML = data.name + " ✅ READY"; }
            });

            socket.on('display_new_story', function(data) {
                document.getElementById('lobby-container').style.display = 'none';
                document.getElementById('live-feed').innerHTML = "<h3>Live Guesses:</h3>"; // Clear old votes
                const board = document.getElementById('story-board');
                board.style.display = 'block';
                board.innerHTML = "<strong>Anonymous Story:</strong><br><br>" + data.text;
            });

            // Show votes live as they happen
            socket.on('show_vote_live', function(data) {
                document.getElementById('live-feed').innerHTML += "<div class='vote-entry'><strong>" + data.voter + "</strong> locked in... Guessing: <strong>" + data.guess + "</strong></div>";
            });

            socket.on('game_reset', () => { window.location.reload(); });
        </script>
    </body>
    </html>
  `);
});

// 3. Deliver the Host Remote
app.get('/host', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Host Remote</title>
        <style>
            body { background: #000; color: #ffaa00; font-family: sans-serif; text-align: center; padding: 20px; }
            button { width: 90%; padding: 20px; margin: 15px 0; font-size: 18px; font-weight: bold; border-radius: 10px; cursor: pointer; border: none; }
            .btn-pull { background: #ffaa00; color: black; }
            .btn-reset { background: #ff4444; color: white; margin-top: 50px; }
            #stats { margin-bottom: 20px; font-size: 20px; }
        </style>
    </head>
    <body>
        <h1>HOST REMOTE</h1>
        <div id="stats">Stories in Bank: <span id="storyCount">0</span></div>
        
        <button class="btn-pull" onclick="triggerNextStory()">PULL RANDOM STORY</button>
        <button class="btn-reset" onclick="resetGame()">🚨 RESET GAME (CLEAR ALL)</button>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
            
            socket.on('update_host_stats', function(data) {
                document.getElementById('storyCount').innerText = data.totalStories;
            });

            function triggerNextStory() {
                socket.emit('host_next_story');
            }

            function resetGame() {
                if(confirm("Are you sure? This will delete all players and stories!")) {
                    socket.emit('host_reset_game');
                }
            }
        </script>
    </body>
    </html>
  `);
});

// 4. The Real-Time Brain
io.on('connection', (socket) => {
  
  // Send current players to new connections just in case
  gameData.players.forEach(p => socket.emit('update_lobby', { name: p }));

  socket.on('player_join', (data) => {
    if (!gameData.players.includes(data.name)) {
        gameData.players.push(data.name);
    }
    io.emit('update_lobby', { name: data.name });
  });

  socket.on('submit_stories', (data) => {
    data.stories.forEach(story => {
        if(story.trim() !== "") {
            gameData.stories.push({ author: data.name, text: story, read: false });
        }
    });
    io.emit('player_submitted', { name: data.name });
    io.emit('update_host_stats', { totalStories: gameData.stories.length });
  });

  socket.on('host_next_story', () => {
    let unreadStories = gameData.stories.filter(s => s.read === false);
    if (unreadStories.length > 0) {
        let randomIndex = Math.floor(Math.random() * unreadStories.length);
        let selectedStory = unreadStories[randomIndex];
        
        selectedStory.read = true;
        gameData.currentStory = selectedStory;
        gameData.votes = []; // Clear votes for the new round
        
        // Send text to TV, and send Player List to phones for the voting buttons
        io.emit('display_new_story', { text: selectedStory.text, players: gameData.players });
    }
  });

  // Handle live votes
  socket.on('cast_vote', (data) => {
      // Gatekeeper: Make sure they haven't voted yet this round
      if(!gameData.votes.find(v => v.voter === data.voter)) {
          gameData.votes.push(data);
          // Instantly flash it on the TV
          io.emit('show_vote_live', data);
      }
  });

  // The Kill Switch
  socket.on('host_reset_game', () => {
      gameData = { players: [], stories: [], currentStory: null, votes: [] };
      io.emit('game_reset');
      io.emit('update_host_stats', { totalStories: 0 });
  });

});

const port = process.env.PORT || 3000;
http.listen(port, () => {
  console.log('Server running on port ' + port);
});
