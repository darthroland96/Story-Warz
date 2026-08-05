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
    stats: {}, 
    roundCount: 0,
    hostName: null,
    theme: "",
    phase: "lobby", 
    timerInterval: null,
    countdown: 0,
    revealQueue: [],
    tieBreaker: { active: false, players: [], wagers: {}, story: null }
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
            body { background: #121212; color: white; font-family: sans-serif; text-align: center; padding: 20px; padding-bottom: 100px; }
            input, button { width: 80%; padding: 15px; margin: 10px; font-size: 16px; border-radius: 8px; border: none; }
            button { background: #ff4444; color: white; font-weight: bold; cursor: pointer; }
            .vote-btn { background: #4444ff; margin: 5px; width: 90%; }
            #submit-section, #waiting-section, #voting-section, #host-controls, #pre-game-host, #wager-section { display: none; }
            
            .host-panel { margin-top: 40px; padding: 15px; border: 2px solid #ffaa00; border-radius: 10px; background: #222; }
            .btn-pull { background: #ffaa00; color: black; }
            .btn-reveal { background: #555; color: white; transition: 0.3s; } 
            .btn-reveal.unlocked { background: #44ff44; color: black; }
            #timer-display { font-size: 24px; color: #ffaa00; font-weight: bold; margin: 10px 0; }
        </style>
    </head>
    <body>
        <h1>STORY WARZ</h1>

        <div id="join-section">
            <input id="playerName" type="text" placeholder="Enter Your Name">
            <button onclick="joinGame()">JOIN LOBBY</button>
        </div>

        <div id="waiting-section">
            <h3 id="wait-text">Waiting for Host to start the game...</h3>
            <div id="timer-display"></div>
        </div>

        <div id="submit-section">
            <h2 id="display-theme" style="color: #ffaa00;"></h2>
            <h3>Submit 3 to 5 Stories</h3>
            <input id="s1" type="text" placeholder="Story 1 (Required)">
            <input id="s2" type="text" placeholder="Story 2 (Required)">
            <input id="s3" type="text" placeholder="Story 3 (Required)">
            <input id="s4" type="text" placeholder="Story 4 (Optional)">
            <input id="s5" type="text" placeholder="Story 5 (Optional)">
            <button onclick="submitStories()">LOCK IN STORIES</button>
        </div>

        <div id="voting-section">
            <h3>Who wrote this?</h3>
            <div id="vote-buttons"></div>
        </div>

        <div id="wager-section">
            <h3 style="color: #ffaa00;">SUDDEN DEATH TIE-BREAKER!</h3>
            <p>You are tied for 1st place! Wager your points before the final story.</p>
            <p>Your Score: <span id="my-score">0</span></p>
            <input id="wagerAmount" type="number" placeholder="Enter Wager Amount" min="0">
            <button onclick="submitWager()">LOCK IN WAGER</button>
        </div>

        <div id="pre-game-host" class="host-panel">
            <h3 style="color: #ffaa00; margin-top: 0;">👑 Setup Game</h3>
            <input id="themeInput" type="text" placeholder="Enter a Theme/Prompt">
            <button style="background: #444;" onclick="generateRandomTheme()">🎲 Random Theme</button>
            <button style="background: #44ff44; color: black;" onclick="startGame()">START WRITING PHASE</button>
        </div>

        <div id="host-controls" class="host-panel">
            <h3 style="color: #ffaa00; margin-top: 0;">👑 Host Controls</h3>
            <div style="margin-bottom: 10px;">Bank: <span id="storyCount">0</span> | Round: <span id="roundCount">0</span>/8</div>
            <button id="btn-pull" class="btn-pull" onclick="triggerNextStory()">1. PULL STORY</button>
            <button id="btn-skip-timer" style="display:none; background: #888;" onclick="skipTimer()">⏩ SKIP TIMER</button>
            
            <button id="btn-reveal" class="btn-reveal" disabled onclick="revealStory()">
                2. REVEAL AUTHOR (<span id="voteCount">0</span>/<span id="totalPlayers">0</span>)
            </button>
            
            <button id="btn-reveal-next" style="display:none; background: #4444ff; color: white;" onclick="revealNextScore()">3. REVEAL NEXT PLACE</button>
            <button id="btn-finale" style="display:none; background: #9900ff;" onclick="checkFinale()">🏆 END GAME / CHECK TIE</button>

            <div id="host-tie-controls" style="display:none; border-top: 1px solid #555; margin-top: 15px; padding-top: 15px;">
                <h4 style="color: #ffaa00; margin: 0 0 10px 0;">SUDDEN DEATH</h4>
                <button class="btn-pull" onclick="pullTieBreaker()">PULL FINAL STORY</button>
                <button id="btn-tie-reveal" class="btn-reveal" disabled onclick="revealTieBreaker()">REVEAL WINNER (<span id="tieVoteCount">0</span>/2)</button>
            </div>

            <button onclick="resetGame()" style="margin-top: 20px; background: #ff4444; color: white;">🚨 RESET GAME</button>
        </div>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
            let myName = "";
            let isHost = false;
            let currentScore = 0;

            window.onload = () => {
                const savedName = localStorage.getItem('storyWarzName');
                if(savedName) {
                    document.getElementById('playerName').value = savedName;
                    joinGame(); 
                }
            };

            const randomThemes = [
                "Your worst childhood injury", "A time you completely embarrassed yourself",
                "A vacation disaster", "The most ridiculous lie you've ever told",
                "A time you got caught doing something bad", "Your worst cooking fail"
            ];

            function generateRandomTheme() {
                document.getElementById('themeInput').value = randomThemes[Math.floor(Math.random() * randomThemes.length)];
            }

            function joinGame() {
                myName = document.getElementById('playerName').value;
                if(myName) {
                    localStorage.setItem('storyWarzName', myName); 
                    socket.emit('player_join', { name: myName });
                    document.getElementById('join-section').style.display = 'none';
                    document.getElementById('waiting-section').style.display = 'block';
                }
            }

            socket.on('sync_state', function(data) {
                if (data.isHost) {
                    isHost = true;
                    if (data.phase === "lobby") document.getElementById('pre-game-host').style.display = 'block';
                    else document.getElementById('host-controls').style.display = 'block';
                }

                if (data.phase === "writing") {
                    document.getElementById('waiting-section').style.display = 'none';
                    document.getElementById('submit-section').style.display = 'block';
                    document.getElementById('display-theme').innerText = "Theme: " + data.theme;
                } else if (data.phase === "voting" && !data.hasVoted) {
                    document.getElementById('waiting-section').style.display = 'none';
                    document.getElementById('voting-section').style.display = 'block';
                    buildVoteButtons(data.players);
                } else if (data.phase === "tiebreaker_wager" && data.tiePlayers.includes(myName)) {
                    document.getElementById('waiting-section').style.display = 'none';
                    document.getElementById('wager-section').style.display = 'block';
                    document.getElementById('my-score').innerText = data.score;
                    currentScore = data.score;
                }
            });

            function startGame() {
                socket.emit('host_start_game', { theme: document.getElementById('themeInput').value || "Free for all" });
            }

            socket.on('game_started', function(data) {
                if(isHost) {
                    document.getElementById('pre-game-host').style.display = 'none';
                    document.getElementById('host-controls').style.display = 'block';
                }
                document.getElementById('waiting-section').style.display = 'none';
                document.getElementById('submit-section').style.display = 'block';
                document.getElementById('display-theme').innerText = "Theme: " + data.theme;
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
                document.getElementById('wait-text').innerText = "Stories locked! Look at the TV.";
            }

            socket.on('timer_tick', function(data) {
                document.getElementById('timer-display').innerText = "Voting unlocks in: " + data.seconds + "s";
            });

            socket.on('voting_unlocked', function(data) {
                document.getElementById('timer-display').innerText = "";
                document.getElementById('waiting-section').style.display = 'none';
                document.getElementById('voting-section').style.display = 'block';
                buildVoteButtons(data.players);
            });

            function buildVoteButtons(playerList) {
                let btnsHTML = "";
                playerList.forEach(p => {
                    if(p !== myName) { btnsHTML += "<button class='vote-btn' onclick='castVote(\\"" + p + "\\")'>" + p + "</button><br>"; }
                });
                document.getElementById('vote-buttons').innerHTML = btnsHTML;
            }

            function castVote(guess) {
                socket.emit('cast_vote', { voter: myName, guess: guess });
                document.getElementById('voting-section').style.display = 'none';
                document.getElementById('waiting-section').style.display = 'block';
                document.getElementById('wait-text').innerText = "Vote locked in!";
            }

            // TIE BREAKER WAGER
            socket.on('start_tiebreaker_wager', function(data) {
                if(isHost) {
                    document.getElementById('btn-pull').style.display = 'none';
                    document.getElementById('btn-reveal').style.display = 'none';
                    document.getElementById('btn-finale').style.display = 'none';
                    document.getElementById('host-tie-controls').style.display = 'block';
                }
                
                if(data.players.includes(myName)) {
                    document.getElementById('waiting-section').style.display = 'none';
                    document.getElementById('wager-section').style.display = 'block';
                    document.getElementById('my-score').innerText = data.scores[myName];
                    currentScore = data.scores[myName];
                } else {
                    document.getElementById('waiting-section').style.display = 'block';
                    document.getElementById('wait-text').innerText = "SUDDEN DEATH! Look at the TV!";
                }
            });

            function submitWager() {
                let wager = parseInt(document.getElementById('wagerAmount').value);
                if(isNaN(wager) || wager < 0) wager = 0;
                if(wager > currentScore) wager = currentScore; // Cap at max score
                socket.emit('submit_wager', { name: myName, amount: wager });
                document.getElementById('wager-section').style.display = 'none';
                document.getElementById('waiting-section').style.display = 'block';
                document.getElementById('wait-text').innerText = "Wager locked. Get ready.";
            }

            socket.on('update_vote_count', function(data) {
                if(isHost) {
                    document.getElementById('voteCount').innerText = data.current;
                    document.getElementById('totalPlayers').innerText = data.total;
                    
                    const revealBtn = document.getElementById('btn-reveal');
                    if(data.current >= data.total && data.total > 0) {
                        revealBtn.disabled = false;
                        revealBtn.classList.add('unlocked');
                    } else {
                        revealBtn.disabled = true;
                        revealBtn.classList.remove('unlocked');
                    }
                }
            });

            socket.on('update_tie_vote_count', function(data) {
                if(isHost) {
                    document.getElementById('tieVoteCount').innerText = data.current;
                    const revealBtn = document.getElementById('btn-tie-reveal');
                    if(data.current >= data.total) {
                        revealBtn.disabled = false;
                        revealBtn.classList.add('unlocked');
                    }
                }
            });

            socket.on('host_prep_leaderboard', function() {
                if(isHost) {
                    document.getElementById('btn-reveal').style.display = 'none';
                    document.getElementById('btn-reveal-next').style.display = 'inline-block';
                }
            });

            function triggerNextStory() { 
                socket.emit('host_next_story'); 
                if(isHost) document.getElementById('btn-skip-timer').style.display = 'inline-block';
            }
            function skipTimer() { 
                socket.emit('host_skip_timer'); 
                if(isHost) document.getElementById('btn-skip-timer').style.display = 'none';
            }
            function revealStory() { socket.emit('host_reveal_author'); }
            function revealNextScore() { socket.emit('host_reveal_next_score'); }
            function checkFinale() { socket.emit('host_check_finale'); }
            function pullTieBreaker() { socket.emit('host_pull_tiebreaker'); }
            function revealTieBreaker() { socket.emit('host_reveal_tiebreaker'); }
            function resetGame() { if(confirm("Are you sure?")) socket.emit('host_reset_game'); }

            socket.on('update_host_stats', function(data) {
                if(isHost) {
                    document.getElementById('storyCount').innerText = data.totalStories;
                    document.getElementById('roundCount').innerText = data.roundCount;
                    document.getElementById('btn-reveal').style.display = 'inline-block';
                    document.getElementById('btn-reveal-next').style.display = 'none';
                    
                    if(data.roundCount >= 8) {
                        document.getElementById('btn-pull').style.display = 'none';
                        document.getElementById('btn-reveal').style.display = 'none';
                        document.getElementById('btn-reveal-next').style.display = 'none';
                        document.getElementById('btn-finale').style.display = 'block';
                    }
                }
            });

            socket.on('game_reset', () => { 
                localStorage.removeItem('storyWarzName'); 
                window.location.reload(); 
            });
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
            #round-indicator { color: #ffaa00; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            #timer-bar { font-size: 30px; color: #ff4444; font-weight: bold; margin-bottom: 20px; }
            #lobby { font-size: 24px; background: #2a2a2a; padding: 20px; border-radius: 10px; display: inline-block; min-width: 300px; }
            .player-row { margin: 10px 0; }
            #story-board, #finale-board { display: none; font-size: 32px; background: #333; padding: 40px; border-radius: 15px; line-height: 1.5; }
            #live-feed { margin-top: 20px; font-size: 24px; color: #ffaa00; text-align: left; display: inline-block; width: 45%; vertical-align: top; }
            #leaderboard { margin-top: 20px; font-size: 24px; text-align: left; display: none; width: 45%; vertical-align: top; background: #111; padding: 20px; border-radius: 10px; border: 2px solid #ff4444;}
            .vote-entry { margin: 10px 0; background: #222; padding: 10px; border-radius: 8px; border-left: 5px solid #ffaa00; }
            .reveal-author { font-size: 40px; color: #44ff44; font-weight: bold; margin-top: 30px; text-transform: uppercase; animation: flash 1s ease-in-out; }
            @keyframes flash { 0% { opacity: 0; } 100% { opacity: 1; } }
            
            .award { margin: 20px 0; padding: 20px; background: #222; border-radius: 10px; border: 2px solid #ffaa00; }
            .award h2 { margin: 0; color: #ffaa00; }
            .award p { font-size: 40px; margin: 10px 0; font-weight: bold; }
        </style>
    </head>
    <body>
        <h1>STORY WARZ</h1>
        <div id="round-indicator"></div>
        <div id="timer-bar"></div>
        
        <div id="lobby-container">
            <h2 id="lobby-title">Players In Lobby:</h2>
            <div id="lobby">Waiting for players...</div>
        </div>

        <div id="story-board"></div>
        <div id="finale-board"></div>
        
        <div id="bottom-container">
            <div id="live-feed"></div>
            <div id="leaderboard"><h3>LEADERBOARD</h3><div id="lb-content"></div></div>
        </div>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
            
            socket.on('update_lobby', function(data) {
                const lobbyDiv = document.getElementById('lobby');
                if(lobbyDiv.innerHTML.includes("Waiting for players...")) { lobbyDiv.innerHTML = ""; }
                if(!document.getElementById('player-' + data.name)) {
                    lobbyDiv.innerHTML += "<div id='player-" + data.name + "' class='player-row'>" + data.name + " ⏳ Waiting...</div>";
                }
            });

            socket.on('game_started', function(data) {
                document.getElementById('lobby-title').innerText = "Tonight's Theme: " + data.theme;
                const rows = document.getElementsByClassName('player-row');
                for(let i=0; i<rows.length; i++) {
                    rows[i].innerHTML = rows[i].id.replace('player-', '') + " ✍️ Writing...";
                }
            });

            socket.on('player_submitted', function(data) {
                const playerDiv = document.getElementById('player-' + data.name);
                if(playerDiv) { playerDiv.innerHTML = data.name + " ✅ READY"; }
            });

            socket.on('display_new_story', function(data) {
                document.getElementById('lobby-container').style.display = 'none';
                document.getElementById('leaderboard').style.display = 'none';
                document.getElementById('lb-content').innerHTML = ""; // Clear old leaderboard
                
                if(data.isTieBreaker) {
                    document.getElementById('round-indicator').innerText = "SUDDEN DEATH TIE-BREAKER!";
                } else {
                    let roundText = "ROUND " + data.round + " OF 8";
                    if(data.isDoublePoints) { roundText += " (DOUBLE POINTS!)"; }
                    document.getElementById('round-indicator').innerText = roundText;
                }

                document.getElementById('live-feed').innerHTML = "<h3>Live Guesses:</h3>"; 
                const board = document.getElementById('story-board');
                board.style.display = 'block';
                board.innerHTML = "<strong>Anonymous Story:</strong><br><br>" + data.text;
            });

            socket.on('timer_tick', function(data) {
                document.getElementById('timer-bar').innerText = "DISCUSS: " + data.seconds + "s";
            });

            socket.on('voting_unlocked', function() {
                document.getElementById('timer-bar').innerText = "VOTING UNLOCKED!";
                setTimeout(() => document.getElementById('timer-bar').innerText = "", 3000);
            });

            socket.on('show_vote_live', function(data) {
                document.getElementById('live-feed').innerHTML += "<div class='vote-entry'><strong>" + data.voter + "</strong> locked in... Guessing: <strong>" + data.guess + "</strong></div>";
            });

            socket.on('show_author_only', function(data) {
                const board = document.getElementById('story-board');
                board.innerHTML += "<div class='reveal-author'>AUTHOR: " + data.author + "!</div>";
                document.getElementById('leaderboard').style.display = 'inline-block';
            });

            socket.on('show_next_score', function(data) {
                const lb = document.getElementById('lb-content');
                lb.innerHTML = "<div class='vote-entry' style='border-left: 5px solid #44ff44; animation: flash 0.5s;'><strong>" + data.name + "</strong>: " + data.score + " pts</div>" + lb.innerHTML;
            });

            // Tie breaker wager alert
            socket.on('start_tiebreaker_wager', function(data) {
                document.getElementById('story-board').style.display = 'none';
                document.getElementById('live-feed').style.display = 'none';
                document.getElementById('leaderboard').style.display = 'none';
                document.getElementById('round-indicator').innerText = "SUDDEN DEATH TIE-BREAKER!";
                document.getElementById('timer-bar').innerText = data.players.join(" vs ") + " are wagering...";
            });

            socket.on('show_finale', function(data) {
                document.getElementById('story-board').style.display = 'none';
                document.getElementById('live-feed').style.display = 'none';
                document.getElementById('leaderboard').style.display = 'none';
                document.getElementById('timer-bar').innerText = "";
                document.getElementById('round-indicator').innerText = "GAME OVER";
                
                const finale = document.getElementById('finale-board');
                finale.style.display = 'block';
                
                finale.innerHTML = \`
                    <div class="award" style="border-color: #44ff44;">
                        <h2 style="color: #44ff44;">👑 GRAND CHAMPION</h2>
                        <p>\${data.winner.name} (\${data.winner.score} pts)</p>
                    </div>
                    <div class="award">
                        <h2>🕵️ THE MASTERMIND</h2>
                        <div style="font-size: 20px; color: #ccc;">Fooled the lobby \${data.mastermind.count} times</div>
                        <p>\${data.mastermind.name}</p>
                    </div>
                    <div class="award">
                        <h2>🤡 THE EASY TARGET</h2>
                        <div style="font-size: 20px; color: #ccc;">Guessed wrong \${data.gullible.count} times</div>
                        <p>\${data.gullible.name}</p>
                    </div>
                \`;
            });

            socket.on('game_reset', () => { window.location.reload(); });
        </script>
    </body>
    </html>
  `);
});

// 3. The Real-Time Brain
io.on('connection', (socket) => {
  
  socket.on('player_join', (data) => {
    if (gameData.players.length === 0) { gameData.hostName = data.name; }

    if (!gameData.players.includes(data.name)) {
        gameData.players.push(data.name);
        gameData.scores[data.name] = 0; 
        gameData.stats[data.name] = { fooled: 0, gullible: 0 };
    }
    
    socket.emit('sync_state', { 
        isHost: (gameData.hostName === data.name),
        phase: gameData.phase,
        theme: gameData.theme,
        players: gameData.players,
        hasVoted: gameData.votes.some(v => v.voter === data.name),
        tiePlayers: gameData.tieBreaker.players,
        score: gameData.scores[data.name]
    });
    
    io.emit('update_lobby', { name: data.name });
  });

  socket.on('host_start_game', (data) => {
      gameData.theme = data.theme;
      gameData.phase = "writing";
      io.emit('game_started', { theme: gameData.theme });
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
        gameData.phase = "voting_locked";
        
        let doublePointsActive = gameData.roundCount >= 5;

        io.emit('display_new_story', { 
            text: selectedStory.text, 
            players: gameData.players,
            round: gameData.roundCount,
            isDoublePoints: doublePointsActive
        });
        
        io.emit('update_vote_count', { current: 0, total: gameData.players.length });
        io.emit('update_host_stats', { totalStories: gameData.stories.length, roundCount: gameData.roundCount });

        // Timer Logic
        gameData.countdown = 90;
        clearInterval(gameData.timerInterval);
        io.emit('timer_tick', { seconds: gameData.countdown });
        
        gameData.timerInterval = setInterval(() => {
            gameData.countdown--;
            io.emit('timer_tick', { seconds: gameData.countdown });
            if (gameData.countdown <= 0) {
                clearInterval(gameData.timerInterval);
                gameData.phase = "voting";
                io.emit('voting_unlocked', { players: gameData.players });
            }
        }, 1000);
    }
  });

  socket.on('host_skip_timer', () => {
      if(gameData.phase === "voting_locked") {
          clearInterval(gameData.timerInterval);
          gameData.countdown = 0;
          gameData.phase = "voting";
          io.emit('voting_unlocked', { players: gameData.players });
      }
  });

  socket.on('cast_vote', (data) => {
      if(!gameData.votes.find(v => v.voter === data.voter)) {
          gameData.votes.push(data);
          io.emit('show_vote_live', data);
          
          if(gameData.phase === "voting") {
              io.emit('update_vote_count', { current: gameData.votes.length, total: gameData.players.length });
          } else if (gameData.phase === "tiebreaker_vote") {
              io.emit('update_tie_vote_count', { current: gameData.votes.length, total: gameData.tieBreaker.players.length });
          }
      }
  });

  socket.on('host_reveal_author', () => {
      if (!gameData.currentStory) return;
      gameData.phase = "reveal";

      let trueAuthor = gameData.currentStory.author;
      let multiplier = (gameData.roundCount >= 5) ? 2 : 1; 

      gameData.votes.forEach(vote => {
          if (vote.voter === trueAuthor) return; 
          if (vote.guess === trueAuthor) {
              gameData.scores[vote.voter] += (2 * multiplier); 
          } else {
              gameData.scores[trueAuthor] += (1 * multiplier); 
              gameData.stats[trueAuthor].fooled++;
              gameData.stats[vote.voter].gullible++;
          }
      });

      // Prepare Step-by-Step Leaderboard
      // Sort lowest to highest, so we can shift() the lowest off the front
      gameData.revealQueue = Object.keys(gameData.scores).sort((a, b) => gameData.scores[a] - gameData.scores[b]);

      io.emit('show_author_only', { author: trueAuthor });
      socket.emit('host_prep_leaderboard');
      gameData.currentStory = null; 
  });

  socket.on('host_reveal_next_score', () => {
      if(gameData.revealQueue.length > 0) {
          let nextPlayer = gameData.revealQueue.shift();
          io.emit('show_next_score', { name: nextPlayer, score: gameData.scores[nextPlayer] });
      }
  });

  socket.on('host_check_finale', () => {
      let sortedPlayers = Object.keys(gameData.scores).sort((a, b) => gameData.scores[b] - gameData.scores[a]);
      let highestScore = gameData.scores[sortedPlayers[0]];
      
      let topPlayers = sortedPlayers.filter(p => gameData.scores[p] === highestScore);

      if(topPlayers.length > 1) {
          // WE HAVE A TIE
          gameData.phase = "tiebreaker_wager";
          gameData.tieBreaker.active = true;
          gameData.tieBreaker.players = topPlayers;
          gameData.tieBreaker.wagers = {};
          
          io.emit('start_tiebreaker_wager', { players: topPlayers, scores: gameData.scores });
      } else {
          // NO TIE, PROCEED TO FINALE
          triggerFinale();
      }
  });

  socket.on('submit_wager', (data) => {
      if(gameData.tieBreaker.active) {
          gameData.tieBreaker.wagers[data.name] = data.amount;
      }
  });

  socket.on('host_pull_tiebreaker', () => {
      let unreadStories = gameData.stories.filter(s => s.read === false);
      if (unreadStories.length > 0) {
          let randomIndex = Math.floor(Math.random() * unreadStories.length);
          let tbStory = unreadStories[randomIndex];
          tbStory.read = true;
          gameData.tieBreaker.story = tbStory;
          gameData.phase = "tiebreaker_vote";
          gameData.votes = [];

          io.emit('display_new_story', { 
              text: tbStory.text, 
              players: gameData.players, 
              isTieBreaker: true 
          });
          io.emit('voting_unlocked', { players: gameData.players });
      }
  });

  socket.on('host_reveal_tiebreaker', () => {
      let tbAuthor = gameData.tieBreaker.story.author;
      
      gameData.votes.forEach(vote => {
          let wager = gameData.tieBreaker.wagers[vote.voter] || 0;
          if (vote.guess === tbAuthor) {
              gameData.scores[vote.voter] += wager;
          } else {
              gameData.scores[vote.voter] -= wager;
          }
      });
      
      triggerFinale();
  });

  function triggerFinale() {
      gameData.phase = "finale";
      let players = Object.keys(gameData.stats);
      if(players.length === 0) return;

      let winner = players.reduce((a, b) => gameData.scores[a] > gameData.scores[b] ? a : b);
      let mastermind = players.reduce((a, b) => gameData.stats[a].fooled > gameData.stats[b].fooled ? a : b);
      let gullible = players.reduce((a, b) => gameData.stats[a].gullible > gameData.stats[b].gullible ? a : b);

      io.emit('show_finale', {
          winner: { name: winner, score: gameData.scores[winner] },
          mastermind: { name: mastermind, count: gameData.stats[mastermind].fooled },
          gullible: { name: gullible, count: gameData.stats[gullible].gullible }
      });
  }

  socket.on('host_reset_game', () => {
      clearInterval(gameData.timerInterval);
      gameData = { players: [], stories: [], currentStory: null, votes: [], scores: {}, stats: {}, roundCount: 0, hostName: null, theme: "", phase: "lobby", countdown: 0, timerInterval: null, revealQueue: [], tieBreaker: { active: false, players: [], wagers: {}, story: null } };
      io.emit('game_reset');
  });

});

const port = process.env.PORT || 3000;
http.listen(port, () => {
  console.log('Server running on port ' + port);
});
