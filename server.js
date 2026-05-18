const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// The Server's Memory
let gameData = {
    players: [],
    stories: [],
    currentStory: null,
    votes: [],
    scores: {},
    roundCount: 0,
    hostName: null // Tracks who is in charge
};

// 1. Deliver the Player Screen (Now includes hidden Host controls)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Story Warz - Player</title>
        <style>
            body { background: #121212; color: white; font-family: sans-serif; text-align: center; padding: 20px; padding-bottom: 100px; }
            input, button { width: 80%; padding: 15px; margin: 10px; font-size: 16px; border-radius: 8px; border: none; }
            button { background: #ff4444; color: white; font-weight: bold; cursor: pointer; }
            .vote-btn { background: #4444ff; margin: 5px; width: 90%; }
            #submit-section, #waiting-section, #voting-section, #host-controls { display: none; }
            
            /* Host Panel Styling */
            #host-controls { margin-top: 40px; padding: 15px; border: 2px solid #ffaa00; border-radius: 10px; background: #222; }
            .btn-pull { background: #ffaa00; color: black; }
            .btn-reveal { background: #44ff44; color: black; }
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

        <div id="host-controls">
            <h3 style="color: #ffaa00; margin-top: 0;">👑 Host Controls</h3>
            <div style="margin-bottom: 10px;">Bank: <span id="storyCount">0</span> | Round: <span id="roundCount">0</span>/8</div>
            <button class="btn-pull" onclick="triggerNextStory()">1. PULL STORY</button>
            <button class="btn-reveal" onclick="revealStory()">2. REVEAL</button>
            <button onclick="resetGame()" style="margin-top: 20px;">🚨 RESET GAME</button>
        </div>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
            let myName = "";
            let isHost = false;

            function joinGame() {
                myName = document.getElementById('playerName').value;
                if(myName) {
                    socket.emit('player_join', { name: myName });
                    document.getElementById('join-section').style.display = 'none';
                    document.getElementById('submit-section').style.display = 'block';
                }
            }

            // Server confirms join and tells us if we are the host
            socket.on('join_success', function(data) {
                if (data.isHost) {
                    isHost = true;
                    document.getElementById('host-controls').style.display = 'block';
                }
            });

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

            socket.on('display_new_story', function(data) {
                document.getElementById('waiting-section').style.display = 'none';
                document.getElementById('voting-section').style.display = 'block';
                
                let btnsHTML = "";
                data.players.forEach(p => {
                    // THE FIX: Only create a button if it is NOT the player's own name
                    if(p !== myName) {
                        btnsHTML += "<button class='vote-btn' onclick='castVote(\\"" + p + "\\")'>" + p + "</button><br>";
                    }
                });
                document.getElementById('vote-buttons').innerHTML = btnsHTML;
            });

            function castVote(guess) {
                socket.emit('cast_vote', { voter: myName, guess: guess });
                document.getElementById('voting-section').style.display = 'none';
                document.getElementById('waiting-section').style.display = 'block';
                document.getElementById('wait-text').innerText = "Vote locked in!";
            }

            // Host Actions
            function triggerNextStory() { socket.emit('host_next_story'); }
            function revealStory() { socket.emit('host_reveal_author'); }
            function resetGame() { if(confirm("Are you sure?")) socket.emit('host_reset_game'); }

            socket.on('update_host_stats', function(data) {
                if(isHost) {
                    document.getElementById('storyCount').innerText = data.totalStories;
                    document.getElementById('roundCount').innerText = data.roundCount;
                }
            });

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
            body { background: #1a1a1a; color: white; font-family: sans-serif; text-align: center; padding: 30px; }
            h1 { color: #ff4444; font-size: 50px; margin-bottom: 5px; }
            #round-indicator { color: #ffaa00; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
            #lobby { font-size: 24px; background: #2a2a2a; padding: 20px; border-radius: 10px; display: inline-block; min-width: 300px; }
            .player-row { margin: 10px 0; }
            #story-board { display: none; font-size: 32px; background: #333; padding: 40px; border-radius: 15px; line-height: 1.5; }
            #live-feed { margin-top: 20px; font-size: 24px; color: #ffaa00; text-align: left; display: inline-block; width: 45%; vertical-align: top; }
            #leaderboard { margin-top: 20px; font-size: 24px; text-align: left; display: none; width: 45%; vertical-align: top; background: #111; padding: 20px; border-radius: 10px; border: 2px solid #ff4444;}
            .vote-entry { margin: 10px 0; background: #222; padding: 10px; border-radius: 8px; border-left: 5px solid #ffaa00; }
            .reveal-author { font-size: 40px; color: #44ff44; font-weight: bold; margin-top: 30px; text-transform: uppercase; animation: flash 1s ease-in-out; }
            @keyframes flash { 0% { opacity: 0; } 100% { opacity: 1; } }
        </style>
    </head>
    <body>
        <h1>STORY WARZ</h1>
        <div id="round-indicator"></div>
        
        <div id="lobby-container">
            <h2>Players In Lobby:</h2>
            <div id="lobby">Waiting for players...</div>
        </div>

        <div id="story-board"></div>
        
        <div id="bottom-container">
            <div id="live-feed"></div>
            <div id="leaderboard"></div>
        </div>

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
                document.getElementById('leaderboard').style.display = 'none';
                
                let roundText = "ROUND " + data.round + " OF 8";
                if(data.isDoublePoints) { roundText += " (DOUBLE POINTS!)"; }
                document.getElementById('round-indicator').innerText = roundText;

                document.getElementById('live-feed').innerHTML = "<h3>Live Guesses:</h3>"; 
                const board = document.getElementById('story-board');
                board.style.display = 'block';
                board.innerHTML = "<strong>Anonymous Story:</strong><br><br>" + data.text;
            });

            socket.on('show_vote_live', function(data) {
                document.getElementById('live-feed').innerHTML += "<div class='vote-entry'><strong>" + data.voter + "</strong> locked in... Guessing: <strong>" + data.guess + "</strong></div>";
            });

            socket.on('show_reveal', function(data) {
                const board = document.getElementById('story-board');
                board.innerHTML += "<div class='reveal-author'>AUTHOR: " + data.author + "!</div>";
                
                const lb = document.getElementById('leaderboard');
                lb.style.display = 'inline-block';
                let lbHTML = "<h3>LEADERBOARD</h3>";
                
                let sortedPlayers = Object.keys(data.scores).sort((a, b) => data.scores[b] - data.scores[a]);
                sortedPlayers.forEach(p => {
                    lbHTML += "<div><strong>" + p + "</strong>: " + data.scores[p] + " pts</div><hr>";
                });
                lb.innerHTML = lbHTML;
            });

            socket.on('game_reset', () => { window.location.reload(); });
        </script>
    </body>
    </html>
  `);
});

// 3. The Real-Time Brain
io.on('connection', (socket) => {
  
  gameData.players.forEach(p => socket.emit('update_lobby', { name: p }));

  socket.on('player_join', (data) => {
    // If no one is in the game yet, this person becomes the host
    if (gameData.players.length === 0) {
        gameData.hostName = data.name;
    }

    if (!gameData.players.includes(data.name)) {
        gameData.players.push(data.name);
        gameData.scores[data.name] = 0; 
    }
    
    // Tell this specific player if they get the Host Crown
    socket.emit('join_success', { isHost: (gameData.hostName === data.name) });
    io.emit('update_lobby', { name: data.name });
  });

  socket.on('submit_stories', (data) => {
    data.stories.forEach(story => {
        if(story.trim() !== "") {
            gameData.stories.push({ author: data.name, text: story, read: false });
        }
    });
    io.emit('player_submitted', { name: data.name });
    io.emit('update_host_stats', { totalStories: gameData.stories.length, roundCount: gameData.roundCount });
  });

  socket.on('host_next_story', () => {
    if (gameData.roundCount >= 8) return; 

    let unreadStories = gameData.stories.filter(s => s.read === false);
    if (unreadStories.length > 0) {
        let randomIndex = Math.floor(Math.random() * unreadStories.length);
        let selectedStory = unreadStories[randomIndex];
        
        selectedStory.read = true;
        gameData.currentStory = selectedStory;
        gameData.votes = []; 
        gameData.roundCount++;
        
        let doublePointsActive = gameData.roundCount >= 5;

        io.emit('display_new_story', { 
            text: selectedStory.text, 
            players: gameData.players,
            round: gameData.roundCount,
            isDoublePoints: doublePointsActive
        });
        
        io.emit('update_host_stats', { totalStories: gameData.stories.length, roundCount: gameData.roundCount });
    }
  });

  socket.on('cast_vote', (data) => {
      if(!gameData.votes.find(v => v.voter === data.voter)) {
          gameData.votes.push(data);
          io.emit('show_vote_live', data);
      }
  });

  socket.on('host_reveal_author', () => {
      if (!gameData.currentStory) return;

      let trueAuthor = gameData.currentStory.author;
      let multiplier = (gameData.roundCount >= 5) ? 2 : 1; 

      gameData.votes.forEach(vote => {
          if (vote.guess === trueAuthor) {
              gameData.scores[vote.voter] += (2 * multiplier); 
          } else {
              gameData.scores[trueAuthor] += (1 * multiplier); 
          }
      });

      io.emit('show_reveal', {
          author: trueAuthor,
          scores: gameData.scores
      });
      
      gameData.currentStory = null; 
  });

  socket.on('host_reset_game', () => {
      gameData = { players: [], stories: [], currentStory: null, votes: [], scores: {}, roundCount: 0, hostName: null };
      io.emit('game_reset');
      io.emit('update_host_stats', { totalStories: 0, roundCount: 0 });
  });

});

const port = process.env.PORT || 3000;
http.listen(port, () => {
  console.log('Server running on port ' + port);
});
