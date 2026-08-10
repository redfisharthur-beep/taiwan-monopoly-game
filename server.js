const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'taiwan', 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 金錢降為 10%，地盤預設升級等級為 0
const board = [
    { name: "起點", type: "start", price: 0 },
    { name: "宜蘭", type: "land", group: "East", price: 200, owner: null, upgradeLevel: 0 },
    { name: "花蓮", type: "land", group: "East", price: 200, owner: null, upgradeLevel: 0 },
    { name: "機會", type: "card", price: 0 },
    { name: "台東", type: "land", group: "East", price: 200, owner: null, upgradeLevel: 0 },
    { name: "旅行中", type: "travel", price: 0 },
    { name: "屏東", type: "land", group: "East", price: 200, owner: null, upgradeLevel: 0 },
    { name: "高雄", type: "land", group: "South", price: 250, owner: null, upgradeLevel: 0 },
    { name: "綠島", type: "land", group: "South", price: 250, owner: null, upgradeLevel: 0 },
    { name: "台南", type: "land", group: "South", price: 250, owner: null, upgradeLevel: 0 },
    { name: "澎湖", type: "land", group: "South", price: 250, owner: null, upgradeLevel: 0 },
    { name: "命運", type: "card", price: 0 },
    { name: "嘉義", type: "land", group: "Central", price: 230, owner: null, upgradeLevel: 0 },
    { name: "雲林", type: "land", group: "Central", price: 230, owner: null, upgradeLevel: 0 },
    { name: "彰化", type: "land", group: "Central", price: 230, owner: null, upgradeLevel: 0 },
    { name: "南投", type: "action", price: 0 },
    { name: "台中", type: "land", group: "North-C", price: 280, owner: null, upgradeLevel: 0 },
    { name: "苗栗", type: "land", group: "North-C", price: 280, owner: null, upgradeLevel: 0 },
    { name: "新竹", type: "land", group: "North-C", price: 280, owner: null, upgradeLevel: 0 },
    { name: "桃園", type: "action", price: 0 },
    { name: "台北", type: "land", group: "North", price: 300, owner: null, upgradeLevel: 0 },
    { name: "新北", type: "land", group: "North", price: 300, owner: null, upgradeLevel: 0 },
    { name: "金門", type: "land", group: "North", price: 300, owner: null, upgradeLevel: 0 },
    { name: "基隆", type: "land", group: "North", price: 300, owner: null, upgradeLevel: 0 }
];

const playerProfiles = [
    { img: "pig.png", color: "#FF9F9F" },
    { img: "cat.png", color: "#9FBFFF" },
    { img: "dog.png", color: "#9FDF9F" },
    { img: "bear.png", color: "#FFDF9F" }
];
let rooms = {}; 

io.on('connection', (socket) => {
    socket.emit('roomList', rooms);

    socket.on('createRoom', ({ roomName, playerName }) => {
        if (rooms[roomName]) {
            socket.emit('errorMsg', '房間名稱已被使用！');
            return;
        }
        rooms[roomName] = {
            roomName: roomName,
            host: socket.id,
            round: 1,
            players: [{
                id: socket.id,
                name: playerName,
                money: 2000,
                pos: 0,
                profile: playerProfiles[0],
                skipTurns: 0
            }],
            started: false,
            turnIndex: 0,
            board: JSON.parse(JSON.stringify(board))
        };
        socket.join(roomName);
        socket.roomName = roomName;
        io.emit('roomList', rooms);
        io.to(roomName).emit('updateGame', rooms[roomName]);
    });

    socket.on('joinRoom', ({ roomName, playerName }) => {
        let room = rooms[roomName];
        if (!room) return socket.emit('errorMsg', '房間不存在！');
        if (room.started) return socket.emit('errorMsg', '遊戲已經開始囉！');
        if (room.players.length >= 4) return socket.emit('errorMsg', '房間已滿（最多4人）！');

        let profileIndex = room.players.length;
        room.players.push({
            id: socket.id,
            name: playerName,
            money: 2000,
            pos: 0,
            profile: playerProfiles[profileIndex],
            skipTurns: 0
        });

        socket.join(roomName);
        socket.roomName = roomName;
        io.emit('roomList', rooms);
        io.to(roomName).emit('updateGame', room);
    });

    socket.on('startGame', () => {
        let room = rooms[socket.roomName];
        if (room && room.host === socket.id) {
            room.started = true;
            io.emit('roomList', rooms);
            io.to(socket.roomName).emit('updateGame', room);
            io.to(socket.roomName).emit('log', '遊戲正式開始！由 ' + room.players[0].name + ' 先攻。');
            startTurn(room);
        }
    });

    socket.on('buyDecision', ({ buy }) => {
        let room = rooms[socket.roomName];
        if (!room) return;
        let currentPlayer = room.players[room.turnIndex];
        let currentTile = room.board[currentPlayer.pos];

        if (buy && currentTile.type === 'land' && !currentTile.owner) {
            if (currentPlayer.money >= currentTile.price) {
                currentPlayer.money -= currentTile.price;
                currentTile.owner = currentPlayer.id;
                currentTile.upgradeLevel = 0; // 初始化等級
                let msg = `🏠 ${currentPlayer.name} 花費 ${currentTile.price} <br>成功買下【${currentTile.name}】！`;
                io.to(socket.roomName).emit('centerAlert', msg);
                io.to(socket.roomName).emit('log', msg.replace(/<br>/g, ' '));
            }
        }
        if (!nextTurn(room)) {
            io.to(room.roomName).emit('updateGame', room);
            startTurn(room);
        }
    });

    socket.on('buyoutLand', () => {
        let room = rooms[socket.roomName];
        if (!room) return;
        let currentPlayer = room.players[room.turnIndex];
        let currentTile = room.board[currentPlayer.pos];

        if (currentTile.type === 'land' && currentTile.owner && currentTile.owner !== currentPlayer.id) {
            let buyoutPrice = currentTile.price * 2; // 改為 2 倍原始價格
            if (currentPlayer.money >= buyoutPrice) {
                currentPlayer.money -= buyoutPrice;
                let ownerObj = room.players.find(p => p.id === currentTile.owner);
                if (ownerObj) ownerObj.money += buyoutPrice;
                
                currentTile.owner = currentPlayer.id;
                currentTile.upgradeLevel = 0; // 重置等級
                let msg = `💰 ${currentPlayer.name} 花費 ${buyoutPrice} (2倍) <br>強制收購了【${currentTile.name}】！`;
                io.to(socket.roomName).emit('centerAlert', msg);
                io.to(socket.roomName).emit('log', msg.replace(/<br>/g, ' '));
                if (!nextTurn(room)) {
                    io.to(room.roomName).emit('updateGame', room);
                    startTurn(room);
                }
            }
        }
    });

    socket.on('skipBuyout', () => {
        let room = rooms[socket.roomName];
        if (room) {
            if (!nextTurn(room)) {
                io.to(room.roomName).emit('updateGame', room);
                startTurn(room);
            }
        }
    });

    socket.on('disconnect', () => {
        for (let rName in rooms) {
            let room = rooms[rName];
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
                delete rooms[rName];
            } else if (room.host === socket.id) {
                room.host = room.players[0].id;
            }
            io.emit('roomList', rooms);
            io.to(rName).emit('updateGame', room);
        }
    });
});

function startTurn(room) {
    if (!room.started) return;
    let currentPlayer = room.players[room.turnIndex];

    if (currentPlayer.skipTurns > 0) {
        currentPlayer.skipTurns--;
        let msg = `${currentPlayer.name} 暫停中，自動跳過，剩餘 ${currentPlayer.skipTurns} 回合。`;
        io.to(room.roomName).emit('centerAlert', msg);
        io.to(room.roomName).emit('log', msg);
        io.to(room.roomName).emit('updateGame', room);
        
        // 動作間隔改為 2000 毫秒
        setTimeout(() => {
            if (!nextTurn(room)) {
                startTurn(room);
            }
        }, 2000); 
        return;
    }

    io.to(room.roomName).emit('updateGame', room);

    // 擲骰子動畫短暫等待，保留 1500 讓玩家看清楚數字
    setTimeout(() => {
        if (!room.started) return;
        let dice = Math.floor(Math.random() * 6) + 1;
        let oldPos = currentPlayer.pos;
        currentPlayer.pos = (currentPlayer.pos + dice) % room.board.length;
        let currentTile = room.board[currentPlayer.pos];

        let msg = `🎲 ${currentPlayer.name} 擲出了 ${dice} 點！<br>來到了【${currentTile.name}】`;
        
        if (currentPlayer.pos < oldPos || (currentPlayer.pos === 0 && dice > 0)) {
            currentPlayer.money += 1000;
            msg += `<br>經過起點，領取薪水 1000！`;
            io.to(room.roomName).emit('playSound', 'money');
        }
        
        io.to(room.roomName).emit('centerAlert', msg);
        io.to(room.roomName).emit('log', msg.replace(/<br>/g, ' '));
        io.to(room.roomName).emit('updateGame', room);

        // 動作間隔改為 2000 毫秒
        setTimeout(() => {
            handleTileEvent(room, currentPlayer, currentTile);
        }, 2000); 
    }, 1500);
}

function handleTileEvent(room, player, tile) {
    if (tile.type === 'land') {
        if (!tile.owner) {
            io.to(player.id).emit('promptBuy', { price: tile.price, name: tile.name });
        } else if (tile.owner === player.id) {
            // 重複踩到自己地盤，觸發升級機制
            if (tile.upgradeLevel === undefined) tile.upgradeLevel = 0;
            
            let msg = '';
            if (tile.upgradeLevel < 2) {
                tile.upgradeLevel++;
                let multi = tile.upgradeLevel === 1 ? 3 : 6;
                msg = `✨ ${player.name} 回到了自己的地盤【${tile.name}】！<br>地盤升級！過路費提升為 ${multi} 倍！`;
            } else {
                msg = `🐾 ${player.name} 回到了自己的地盤【${tile.name}】（過路費已達最高 6 倍）。`;
            }

            io.to(room.roomName).emit('centerAlert', msg);
            io.to(room.roomName).emit('log', msg.replace(/<br>/g, ' '));
            if (!nextTurn(room)) {
                io.to(room.roomName).emit('updateGame', room);
                startTurn(room);
            }
        } else {
            let ownerObj = room.players.find(p => p.id === tile.owner);
            let sameGroupCount = room.board.filter(b => b.group === tile.group && b.owner === tile.owner).length;
            
            let toll = Math.round(tile.price * 0.5 * Math.pow(2, sameGroupCount - 1));

            if (tile.upgradeLevel === 1) toll *= 3;
            else if (tile.upgradeLevel === 2) toll *= 6;

            if (player.money >= toll) {
                player.money -= toll;
                ownerObj.money += toll;
                let msg = `💸 ${player.name} 踩到別人地盤<br>支付過路費 ${toll} 給 ${ownerObj.name}！`;
                io.to(room.roomName).emit('centerAlert', msg);
                io.to(room.roomName).emit('log', msg.replace(/<br>/g, ' '));
                io.to(room.roomName).emit('updateGame', room);
                
                // 動作間隔改為 2000 毫秒，然後提示是否強制收購
                setTimeout(() => {
                    io.to(player.id).emit('promptBuyout', { price: tile.price * 2, money: player.money, name: tile.name }); 
                }, 2000); 
            } else {
                player.money = 2000;
                player.pos = 0;
                player.skipTurns = 2;
                let msg = `💥 ${player.name} 破產！<br>無力支付過路費，強制回到起點，獲得急難救助金 2000，暫停 2 回合！`;
                io.to(room.roomName).emit('centerAlert', msg);
                io.to(room.roomName).emit('log', msg.replace(/<br>/g, ' '));
                if (!nextTurn(room)) {
                    io.to(room.roomName).emit('updateGame', room);
                    startTurn(room);
                }
            }
        }
    } else if (tile.type === 'card') {
        let isChance = (tile.name === "機會");
        handleCardEvent(room, player, isChance);
    } else if (tile.name === "南投") {
        let msg = `🎲 ${player.name} 來到南投！<br>自動再擲一次骰子！`;
        io.to(room.roomName).emit('centerAlert', msg);
        io.to(room.roomName).emit('log', msg.replace(/<br>/g, ' '));

        // 動作間隔改為 2000 毫秒
        setTimeout(() => {
            let dice = Math.floor(Math.random() * 6) + 1;
            let oldPos = player.pos;
            player.pos = (player.pos + dice) % room.board.length;
            let currentTile = room.board[player.pos];

            let subMsg = `🎲 ${player.name} 再次擲出了 ${dice} 點！<br>來到了【${currentTile.name}】`;
            
            if (player.pos < oldPos || (player.pos === 0 && dice > 0)) {
                player.money += 1000;
                subMsg += `<br>經過起點，領取薪水 1000！`;
                io.to(room.roomName).emit('playSound', 'money');
            }
            
            io.to(room.roomName).emit('centerAlert', subMsg);
            io.to(room.roomName).emit('log', subMsg.replace(/<br>/g, ' '));
            io.to(room.roomName).emit('updateGame', room);

            // 動作間隔改為 2000 毫秒
            setTimeout(() => {
                handleTileEvent(room, player, currentTile);
            }, 2000); 
        }, 2000); 

    } else if (tile.name === "桃園") {
        player.pos = 5; 
        player.skipTurns = 3;
        let msg = `✈️ ${player.name} 從桃園出國囉！<br>強制移動到「旅行中」並暫停 3 回合！`;
        io.to(room.roomName).emit('centerAlert', msg);
        io.to(room.roomName).emit('log', msg.replace(/<br>/g, ' '));
        if (!nextTurn(room)) {
            io.to(room.roomName).emit('updateGame', room);
            startTurn(room);
        }
    } else {
        if (!nextTurn(room)) {
            io.to(room.roomName).emit('updateGame', room);
            startTurn(room);
        }
    }
}

function handleCardEvent(room, player, isChance) {
    let effects = [];
    if (isChance) {
        effects = [
            { type: 'money', val: 1000, desc: '獲得獎勵金錢 1000！', isReward: true },
            { type: 'money', val: 50, desc: '獲得獎勵金錢 50！', isReward: true },
            { type: 'land_get', desc: '幸運降臨！隨機獲得一塊未被佔領的地盤！', isReward: true },
            { type: 'money', val: -50, desc: '遭遇倒霉事...失去 50！', isReward: false },
            { type: 'land_lose', desc: '真不幸...隨機失去一塊已佔領的地盤！', isReward: false },
            { type: 'land_grab_three', desc: '逆轉勝來了！隨機豪取 3 塊地盤（無論是否有所屬）！', isReward: true },
            { type: 'money', val: 3000, desc: '天選之人，恭喜中樂透！獲得 3000 獎金！', isReward: true },
            { type: 'philanthropist', desc: '慈善家！現金最多的玩家，施捨給現金最少的玩家 1000元', isReward: true },
            { type: 'welcome_donate', desc: '歡迎斗內~每人都捐 300元，給抽到此牌的玩家', isReward: true }
        ];
    } else {
        effects = [
            { type: 'money', val: 50, desc: '獲得獎勵金錢 50！', isReward: true },
            { type: 'land_get', desc: '幸運降臨！隨機獲得一塊未被佔領的地盤！', isReward: true },
            { type: 'money', val: -1000, desc: '遭遇大災難...失去 1000！', isReward: false },
            { type: 'money', val: -50, desc: '遭遇倒霉事...失去 50！', isReward: false },
            { type: 'land_lose', desc: '真不幸...隨機失去一塊已佔領的地盤！', isReward: false },
            { type: 'travel_forced', desc: '出差辛苦了~強制移動到旅行中，暫停 2 回合！', isReward: false },
            { type: 'land_charity', desc: '土地最多的玩家，隨機施捨 1 塊土地給「土地最少的玩家」', isReward: false },
            { type: 'generous_rain', desc: '豪氣沖天！抽到此牌的玩家，發給每人 200元', isReward: false }
        ];
    }

    let choice = effects[Math.floor(Math.random() * effects.length)];
    let cardTypeName = isChance ? "機會" : "命運";
    let msg = `🃏 抽到【${cardTypeName}】卡牌！<br>`;

    if (choice.type === 'money') {
        player.money += choice.val;
        if (player.money < 0) player.money = 0;
        let colorStyle = choice.isReward ? 'color:#FF7F7F' : 'color:#7F7FFF';
        msg += `<span style="${colorStyle}">${choice.desc}</span>`;
    } else if (choice.type === 'land_get') {
        let unownedLands = room.board.filter(b => b.type === 'land' && !b.owner);
        if (unownedLands.length > 0) {
            let targetLand = unownedLands[Math.floor(Math.random() * unownedLands.length)];
            targetLand.owner = player.id;
            targetLand.upgradeLevel = 0;
            msg += `<span style="color:#FF7F7F">${choice.desc} 獲得了【${targetLand.name}】！</span>`;
        } else {
            player.money += 200;
            msg += `<span style="color:#FF7F7F">場上已無未被佔領的地盤，改為獲得獎勵 200！</span>`;
        }
    } else if (choice.type === 'land_lose') {
        let playerLands = room.board.filter(b => b.type === 'land' && b.owner === player.id);
        if (playerLands.length > 0) {
            let targetLand = playerLands[Math.floor(Math.random() * playerLands.length)];
            let landName = targetLand.name;
            targetLand.owner = null;
            targetLand.upgradeLevel = 0;
            msg += `<span style="color:#7F7FFF">${choice.desc} 失去了【${landName}】（變回無人佔領）！</span>`;
        } else {
            msg += `<span style="color:#7F7FFF">你目前名下沒有地盤可失去，逃過一劫！</span>`;
        }
    } else if (choice.type === 'land_grab_three') {
        let allLands = room.board.filter(b => b.type === 'land');
        let grabbedNames = [];
        for (let i = 0; i < 3; i++) {
            if (allLands.length === 0) break;
            let randomIndex = Math.floor(Math.random() * allLands.length);
            let targetLand = allLands.splice(randomIndex, 1)[0];
            targetLand.owner = player.id;
            targetLand.upgradeLevel = 0;
            grabbedNames.push(targetLand.name);
        }
        if (grabbedNames.length > 0) {
            msg += `<span style="color:#FF7F7F">${choice.desc} 成功奪下：【${grabbedNames.join('、')}】！</span>`;
        } else {
            msg += `<span style="color:#FF7F7F">場上沒有可取的地盤！</span>`;
        }
    } else if (choice.type === 'travel_forced') {
        player.pos = 5;
        player.skipTurns = 2;
        msg += `<span style="color:#7F7FFF">${choice.desc}</span>`;
    } else if (choice.type === 'philanthropist') {
        let sortedPlayers = [...room.players].sort((a, b) => b.money - a.money);
        let richest = sortedPlayers[0];
        let poorest = sortedPlayers[sortedPlayers.length - 1];
        
        if (richest.id === poorest.id || room.players.length < 2) {
            msg += `<span style="color:#FF7F7F">${choice.desc} (人數不足或現金皆相同，未發生交易)</span>`;
        } else {
            let giveAmount = Math.min(richest.money, 1000);
            richest.money -= giveAmount;
            poorest.money += giveAmount;
            msg += `<span style="color:#FF7F7F">${choice.desc}<br>${richest.name} 施捨了 ${giveAmount} 元給 ${poorest.name}！</span>`;
        }
    } else if (choice.type === 'welcome_donate') {
        let totalCollected = 0;
        room.players.forEach(p => {
            if (p.id !== player.id) {
                let pay = Math.min(p.money, 300);
                p.money -= pay;
                totalCollected += pay;
            }
        });
        player.money += totalCollected;
        msg += `<span style="color:#FF7F7F">${choice.desc}<br>總共獲得了 ${totalCollected} 元斗內！</span>`;
    } else if (choice.type === 'land_charity') {
        let landCounts = room.players.map(p => {
            let lands = room.board.filter(b => b.type === 'land' && b.owner === p.id);
            return { player: p, lands: lands };
        });
        landCounts.sort((a, b) => b.lands.length - a.lands.length);
        
        let richestOwner = landCounts[0];
        let poorestOwner = landCounts[landCounts.length - 1];

        if (richestOwner.player.id === poorestOwner.player.id || richestOwner.lands.length === 0) {
            msg += `<span style="color:#7F7FFF">${choice.desc}<br>（沒有符合條件的土地或玩家土地數量相同，跳過）</span>`;
        } else {
            let randomLandIdx = Math.floor(Math.random() * richestOwner.lands.length);
            let transferredLand = richestOwner.lands[randomLandIdx];
            transferredLand.owner = poorestOwner.player.id;
            transferredLand.upgradeLevel = 0; 
            msg += `<span style="color:#7F7FFF">${choice.desc}<br>${richestOwner.player.name} 將【${transferredLand.name}】施捨給了 ${poorestOwner.player.name}！</span>`;
        }
    } else if (choice.type === 'generous_rain') {
        let otherPlayers = room.players.filter(p => p.id !== player.id);
        let totalCost = otherPlayers.length * 200;
        
        if (player.money < totalCost) {
            let actualPerPerson = Math.floor(player.money / (otherPlayers.length || 1));
            otherPlayers.forEach(p => p.money += actualPerPerson);
            player.money = 0;
            msg += `<span style="color:#7F7FFF">${choice.desc}<br>現金不足，改為每人發 ${actualPerPerson} 元！</span>`;
        } else {
            player.money -= totalCost;
            otherPlayers.forEach(p => p.money += 200);
            msg += `<span style="color:#7F7FFF">${choice.desc}<br>豪氣發給其他每位玩家 200 元！</span>`;
        }
    }

    io.to(room.roomName).emit('centerAlert', msg);
    io.to(room.roomName).emit('log', msg.replace(/<br>/g, ' ').replace(/<[^>]+>/g, ''));
    io.to(room.roomName).emit('updateGame', room);

    // 動作間隔改為 2000 毫秒
    setTimeout(() => {
        if (!nextTurn(room)) {
            io.to(room.roomName).emit('updateGame', room);
            startTurn(room);
        }
    }, 2000);
}

function nextTurn(room) {
    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    if (room.turnIndex === 0) {
        room.round++;
        // 修改為 30 輪結束
        if (room.round > 30) {
            room.started = false;
            let ranking = room.players.map(p => {
                let landValue = room.board.filter(b => b.owner === p.id).reduce((sum, b) => sum + b.price, 0);
                let totalAssets = p.money + landValue;
                return {
                    name: p.name,
                    money: p.money,
                    landValue: landValue,
                    totalAssets: totalAssets,
                    profile: p.profile
                };
            });
            ranking.sort((a, b) => b.totalAssets - a.totalAssets);
            
            io.to(room.roomName).emit('gameOver', ranking);

            delete rooms[room.roomName];
            io.emit('roomList', rooms);
            return true;
        }
    }
    return false;
}

server.listen(3000, () => {
    console.log('大富翁伺服器已啟動 localhost:3000');
});