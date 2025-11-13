const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const players = {}; // Store the players by game room

// Serve static files
app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Listen for a room creation or join event
    socket.on('createGame', (roomId) => {
        socket.join(roomId);
        players[roomId] = { playerX: socket.id, playerO: null, board: Array(9).fill(null), turn: 'X' }; // Add first player
        console.log(`Game created with ID: ${roomId}`);
        io.to(socket.id).emit('assignedRole', 'X'); // Assign "X" to the first player
    });

    socket.on('joinGame', (roomId) => {
        const game = players[roomId];
        if (game && !game.playerO) {
            socket.join(roomId);
            game.playerO = socket.id; // Add second player
            console.log(`Player joined game with ID: ${roomId}`);
            io.to(socket.id).emit('assignedRole', 'O'); // Assign "O" to the second player
            io.to(roomId).emit('startGame'); // Notify both players to start the game
        } else {
            io.to(socket.id).emit('error', 'Game not found or already full');
        }
    });

    // Handle player moves
    socket.on('makeMove', (data) => {
        const { roomId, index } = data;
        const game = players[roomId];

        // Check if the move is valid
        if (game.board[index] === null && game.turn === data.symbol) {
            game.board[index] = data.symbol; // Update the board with the move

            // Emit the update to the board
            io.to(roomId).emit('updateBoard', { index, symbol: data.symbol });

            // Check for a winner
            const winner = checkWinner(game.board);
            if (winner) {
                setTimeout(() => {
                    io.to(roomId).emit('endGame', { winner });
                }, 100); // Small delay to ensure the board is updated
            } else if (!game.board.includes(null)) {
                setTimeout(() => {
                    io.to(roomId).emit('endGame', { winner: 'Draw' });
                }, 100); // Small delay to ensure the board is updated
            } else {
                // Switch turn between players
                game.turn = game.turn === 'X' ? 'O' : 'X'; // Toggle turn
            }
        } else {
            // Invalid move: either cell is occupied or it's not your turn
            io.to(socket.id).emit('error', 'Invalid move. Either the cell is occupied or it is not your turn.');
        }
    });

    // Reset game
    socket.on('resetGame', (roomId) => {
        const game = players[roomId];
        game.board = Array(9).fill(null);
        
        // Randomly assign roles for the new game
        const randomRole = Math.random() < 0.5 ? 'X' : 'O';
        if (randomRole === 'X') {
            io.to(game.playerX).emit('assignedRole', 'X'); // Assign 'X' to playerX
            io.to(game.playerO).emit('assignedRole', 'O'); // Assign 'O' to playerO
            game.turn = 'X'; // 'X' always goes first
        } else {
            io.to(game.playerX).emit('assignedRole', 'O'); // Assign 'O' to playerX
            io.to(game.playerO).emit('assignedRole', 'X'); // Assign 'X' to playerO
            game.turn = 'X'; // 'X' always goes first
        }

        io.to(roomId).emit('resetBoard'); // Notify players to reset the board
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
        for (let roomId in players) {
            if (players[roomId].playerX === socket.id || players[roomId].playerO === socket.id) {
                delete players[roomId]; // Remove game if a player disconnects
                io.to(roomId).emit('resetGame');
                break;
            }
        }
    });
});

// Check for a winner
function checkWinner(board) {
    const winningCombinations = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Horizontal
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Vertical
        [0, 4, 8], [2, 4, 6]             // Diagonal
    ];
    for (const combo of winningCombinations) {
        const [a, b, c] = combo;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a]; // Return the winning symbol
        }
    }
    return null; // No winner
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
