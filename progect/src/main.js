import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// 場景設置
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 遊戲狀態
const gameState = {
    players: [],
    keys: {},
    speed: 0.5,        // 增加基礎移動速度
    score: 0,
    gridSize: 20,  // 網格大小
    cellSize: 5,   // 每個格子的大小
    moving: false, // 是否正在移動
    targetPosition: null, // 目標位置
    moveStartTime: 0,  // 移動開始時間
    moveDuration: 0.2,  // 移動動畫持續時間（秒）
    cameraOffset: new THREE.Vector3(0, 80, 80), // 調整相機高度和距離
    gameStartTime: null, // 遊戲開始時間
    gameTime: 0,    // 遊戲時間（秒）
    isGameRunning: false, // 遊戲是否正在運行
    bullets: [],    // 存儲所有子彈
    lastShootTime: {  // 上次射擊時間
        player: 0,
        chaser: 0
    },
    shootCooldown: 0.5  // 射擊冷卻時間（秒）
};

// 添加星空背景
const starGeometry = new THREE.BufferGeometry();
const starMaterial = new THREE.PointsMaterial({
    color: 0xFFFFFF,
    size: 0.1
});

const starVertices = [];
for (let i = 0; i < 10000; i++) {
    const x = (Math.random() - 0.5) * 2000;
    const y = (Math.random() - 0.5) * 2000;
    const z = (Math.random() - 0.5) * 2000;
    starVertices.push(x, y, z);
}

starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

// 創建網格地面
function createGrid() {
    const size = gameState.gridSize * gameState.cellSize;
    
    // 創建主地面
    const geometry = new THREE.PlaneGeometry(size, size, gameState.gridSize, gameState.gridSize);
    const material = new THREE.MeshPhongMaterial({
        color: 0x1a472a,
        wireframe: false,
        side: THREE.DoubleSide,
        shininess: 30,
        specular: 0x444444
    });

    const grid = new THREE.Mesh(geometry, material);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = -1;
    scene.add(grid);

    // 添加發光網格線
    const gridHelper = new THREE.GridHelper(size, gameState.gridSize, 0x00ff00, 0x00ff00);
    gridHelper.position.y = -0.9;
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // 添加邊界線
    const borderGeometry = new THREE.BoxGeometry(size, 0.1, 0.1);
    const borderMaterial = new THREE.MeshPhongMaterial({
        color: 0x00ff00,
        emissive: 0x00ff00,
        emissiveIntensity: 0.2
    });

    // 創建四條邊界線
    const borders = [];
    const positions = [
        [0, -0.9, size/2],    // 上邊界
        [0, -0.9, -size/2],   // 下邊界
        [size/2, -0.9, 0],    // 右邊界
        [-size/2, -0.9, 0]    // 左邊界
    ];
    const rotations = [
        [0, 0, 0],           // 上邊界
        [0, 0, 0],           // 下邊界
        [0, Math.PI/2, 0],   // 右邊界
        [0, Math.PI/2, 0]    // 左邊界
    ];

    positions.forEach((pos, index) => {
        const border = new THREE.Mesh(borderGeometry, borderMaterial);
        border.position.set(...pos);
        border.rotation.set(...rotations[index]);
        scene.add(border);
        borders.push(border);
    });

    // 添加環境光效果
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    // 添加點光源
    const pointLight = new THREE.PointLight(0x00ff00, 1, 100);
    pointLight.position.set(0, 10, 0);
    scene.add(pointLight);

    return grid;
}

// 創建障礙物
function createObstacles() {
    const obstacles = [];
    const obstacleCount = 30;

    for (let i = 0; i < obstacleCount; i++) {
        const x = Math.floor(Math.random() * gameState.gridSize) * gameState.cellSize - (gameState.gridSize * gameState.cellSize / 2) + gameState.cellSize / 2;
        const z = Math.floor(Math.random() * gameState.gridSize) * gameState.cellSize - (gameState.gridSize * gameState.cellSize / 2) + gameState.cellSize / 2;

        // 避免在玩家初始位置生成障礙物
        if (Math.abs(x) < gameState.cellSize && Math.abs(z) < gameState.cellSize) continue;

        const geometry = new THREE.BoxGeometry(gameState.cellSize * 0.8, gameState.cellSize, gameState.cellSize * 0.8);
        const material = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
        const obstacle = new THREE.Mesh(geometry, material);
        obstacle.position.set(x, gameState.cellSize / 2, z);
        scene.add(obstacle);
        obstacles.push(obstacle);
    }

    return obstacles;
}

const grid = createGrid();
const obstacles = createObstacles();

// 創建玩家
function createPlayer(color, position) {
    const geometry = new THREE.SphereGeometry(gameState.cellSize * 0.4, 32, 32);
    const material = new THREE.MeshPhongMaterial({ 
        color,
        shininess: 30,
        specular: 0x444444
    });
    const player = new THREE.Mesh(geometry, material);
    player.position.copy(position);
    player.userData.speed = gameState.speed;
    player.userData.startPosition = position.clone(); // 記錄起始位置
    scene.add(player);
    return player;
}

// 創建玩家和追蹤者
const player = createPlayer(0x00ff00, new THREE.Vector3(0, 0, 0));
const chaser = createPlayer(0xff0000, new THREE.Vector3(gameState.cellSize * 2, 0, gameState.cellSize * 2));

gameState.players = [player, chaser];

// 添加光源
const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(1, 1, 1);
scene.add(directionalLight);

// 更新相機位置
function updateCamera() {
    // 計算相機目標位置
    const targetPosition = player.position.clone().add(gameState.cameraOffset);
    
    // 平滑過渡到新位置
    camera.position.lerp(targetPosition, 0.1);
    
    // 相機始終看向玩家，但稍微向下傾斜
    const lookAtPosition = player.position.clone();
    lookAtPosition.y -= 10; // 讓相機稍微向下看
    camera.lookAt(lookAtPosition);
}

// 初始化相機位置
camera.position.copy(player.position.clone().add(gameState.cameraOffset));
const initialLookAt = player.position.clone();
initialLookAt.y -= 10;
camera.lookAt(initialLookAt);

// 檢查位置是否有效
function isValidPosition(position) {
    // 檢查是否在網格範圍內
    const halfSize = (gameState.gridSize * gameState.cellSize) / 2;
    if (Math.abs(position.x) > halfSize || Math.abs(position.z) > halfSize) {
        return false;
    }

    // 檢查是否與障礙物碰撞
    for (const obstacle of obstacles) {
        const distance = position.distanceTo(obstacle.position);
        if (distance < gameState.cellSize) {
            return false;
        }
    }

    return true;
}

// 獲取網格位置
function getGridPosition(position) {
    const x = Math.round(position.x / gameState.cellSize) * gameState.cellSize;
    const z = Math.round(position.z / gameState.cellSize) * gameState.cellSize;
    return new THREE.Vector3(x, 0, z);
}

// 更新玩家位置
function updatePlayerPosition() {
    if (gameState.moving && gameState.targetPosition) {
        const currentTime = performance.now() / 1000;
        const elapsedTime = currentTime - gameState.moveStartTime;
        const progress = Math.min(elapsedTime / gameState.moveDuration, 1);

        // 使用緩動函數使移動更平滑
        const easeProgress = easeInOutQuad(progress);
        
        // 插值計算當前位置
        player.position.lerpVectors(
            player.userData.startPosition,
            gameState.targetPosition,
            easeProgress
        );

        // 如果移動完成
        if (progress >= 1) {
            player.position.copy(gameState.targetPosition);
            gameState.moving = false;
            gameState.targetPosition = null;
        }
    }
}

// 緩動函數
function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// 創建子彈
function createBullet(position, direction, isPlayerBullet) {
    const bulletGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const bulletMaterial = new THREE.MeshPhongMaterial({
        color: isPlayerBullet ? 0x00ff00 : 0xff0000,
        emissive: isPlayerBullet ? 0x00ff00 : 0xff0000,
        emissiveIntensity: 0.5
    });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    bullet.position.copy(position);
    bullet.userData.direction = direction;
    bullet.userData.speed = 20; // 子彈速度
    bullet.userData.isPlayerBullet = isPlayerBullet;
    scene.add(bullet);
    gameState.bullets.push(bullet);
    return bullet;
}

// 更新子彈位置
function updateBullets() {
    const currentTime = performance.now() / 1000;
    
    for (let i = gameState.bullets.length - 1; i >= 0; i--) {
        const bullet = gameState.bullets[i];
        bullet.position.add(bullet.userData.direction.clone().multiplyScalar(bullet.userData.speed * 0.016)); // 0.016 是約等於 1/60 秒

        // 檢查子彈是否超出邊界
        const halfSize = (gameState.gridSize * gameState.cellSize) / 2;
        if (Math.abs(bullet.position.x) > halfSize || 
            Math.abs(bullet.position.z) > halfSize) {
            scene.remove(bullet);
            gameState.bullets.splice(i, 1);
            continue;
        }

        // 檢查子彈是否擊中目標
        const target = bullet.userData.isPlayerBullet ? chaser : player;
        const distance = bullet.position.distanceTo(target.position);
        if (distance < gameState.cellSize) {
            if (bullet.userData.isPlayerBullet) {
                gameState.score += 1;
            } else {
                gameState.score -= 1;
            }
            scene.remove(bullet);
            gameState.bullets.splice(i, 1);
        }
    }
}

// 修改鍵盤控制事件
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    const currentTime = performance.now() / 1000;
    
    // 玩家控制（WASD）
    if (['w', 's', 'a', 'd'].includes(key) && !gameState.moving) {
        const currentPos = player.position.clone();
        const targetPos = currentPos.clone();

        // 根據相機方向調整移動方向
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0;
        cameraDirection.normalize();

        const rightVector = new THREE.Vector3(-cameraDirection.z, 0, cameraDirection.x);

        switch (key) {
            case 'w': // 向前移動（相機方向）
                targetPos.add(cameraDirection.multiplyScalar(gameState.cellSize));
                break;
            case 's': // 向後移動（相機反方向）
                targetPos.add(cameraDirection.multiplyScalar(-gameState.cellSize));
                break;
            case 'a': // 向左移動（相機右側）
                targetPos.add(rightVector.multiplyScalar(-gameState.cellSize));
                break;
            case 'd': // 向右移動（相機左側）
                targetPos.add(rightVector.multiplyScalar(gameState.cellSize));
                break;
        }

        if (isValidPosition(targetPos)) {
            gameState.moving = true;
            gameState.targetPosition = targetPos;
            gameState.moveStartTime = currentTime;
            player.userData.startPosition = player.position.clone();
        }
    }
    
    // 玩家射擊（空格鍵）
    if (key === ' ' && currentTime - gameState.lastShootTime.player >= gameState.shootCooldown) {
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0;
        cameraDirection.normalize();
        
        createBullet(
            player.position.clone().add(cameraDirection.multiplyScalar(gameState.cellSize)),
            cameraDirection,
            true
        );
        gameState.lastShootTime.player = currentTime;
    }
    
    // 追蹤者控制（方向鍵）
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key) && !chaser.userData.moving) {
        const currentPos = chaser.position.clone();
        const targetPos = currentPos.clone();

        // 根據相機方向調整移動方向
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0;
        cameraDirection.normalize();

        const rightVector = new THREE.Vector3(-cameraDirection.z, 0, cameraDirection.x);

        switch (key) {
            case 'arrowup': // 向上移動（相機方向）
                targetPos.add(cameraDirection.multiplyScalar(gameState.cellSize));
                break;
            case 'arrowdown': // 向下移動（相機反方向）
                targetPos.add(cameraDirection.multiplyScalar(-gameState.cellSize));
                break;
            case 'arrowleft': // 向左移動（相機右側）
                targetPos.add(rightVector.multiplyScalar(-gameState.cellSize));
                break;
            case 'arrowright': // 向右移動（相機左側）
                targetPos.add(rightVector.multiplyScalar(gameState.cellSize));
                break;
        }

        if (isValidPosition(targetPos)) {
            chaser.userData.moving = true;
            chaser.userData.targetPosition = targetPos;
            chaser.userData.startPosition = currentPos.clone();
            chaser.userData.moveStartTime = currentTime;
        }
    }
    
    // 追蹤者射擊（Enter鍵）
    if (key === 'enter' && currentTime - gameState.lastShootTime.chaser >= gameState.shootCooldown) {
        const direction = player.position.clone().sub(chaser.position).normalize();
        createBullet(
            chaser.position.clone().add(direction.multiplyScalar(gameState.cellSize)),
            direction,
            false
        );
        gameState.lastShootTime.chaser = currentTime;
    }
});

// 更新追蹤者位置
function updateChaserPosition() {
    if (chaser.userData.moving && chaser.userData.targetPosition) {
        const currentTime = performance.now() / 1000;
        const elapsedTime = currentTime - chaser.userData.moveStartTime;
        const progress = Math.min(elapsedTime / gameState.moveDuration, 1);
        const easeProgress = easeInOutQuad(progress);

        chaser.position.lerpVectors(
            chaser.userData.startPosition,
            chaser.userData.targetPosition,
            easeProgress
        );

        if (progress >= 1) {
            chaser.position.copy(chaser.userData.targetPosition);
            chaser.userData.moving = false;
            chaser.userData.targetPosition = null;
        }
    }
}

// 檢查碰撞
function checkCollision() {
    const distance = player.position.distanceTo(chaser.position);
    if (distance < gameState.cellSize) {
        gameState.score -= 1;
        // 重置追蹤者位置
        let newX, newZ;
        do {
            newX = (Math.floor(Math.random() * gameState.gridSize) - gameState.gridSize / 2) * gameState.cellSize;
            newZ = (Math.floor(Math.random() * gameState.gridSize) - gameState.gridSize / 2) * gameState.cellSize;
        } while (!isValidPosition(new THREE.Vector3(newX, 0, newZ)));

        chaser.position.set(newX, 0, newZ);
    }
}

// 更新分數顯示
function updateScore() {
    const scoreElement = document.getElementById('score');
    if (scoreElement) {
        scoreElement.textContent = `分數: ${gameState.score}`;
    }
}

// 更新計時器顯示
function updateTimer() {
    const timerElement = document.getElementById('timer');
    if (timerElement) {
        const minutes = Math.floor(gameState.gameTime / 60);
        const seconds = Math.floor(gameState.gameTime % 60);
        timerElement.textContent = `時間: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

// 開始遊戲
function startGame() {
    gameState.gameStartTime = performance.now() / 1000;
    gameState.isGameRunning = true;
    gameState.gameTime = 0;
}

// 動畫循環
function animate() {
    requestAnimationFrame(animate);
    
    // 更新遊戲時間
    if (gameState.isGameRunning) {
        const currentTime = performance.now() / 1000;
        gameState.gameTime = currentTime - gameState.gameStartTime;
        updateTimer();
    }
    
    updatePlayerPosition();
    updateChaserPosition();
    updateBullets(); // 添加子彈更新
    checkCollision();
    updateScore();
    
    renderer.render(scene, camera);
}

// 處理窗口大小變化
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    // 重新設置相機位置以保持視角
    updateCamera();
});

// 初始化遊戲
function initGame() {
    // 創建計時器元素
    const timerElement = document.createElement('div');
    timerElement.id = 'timer';
    timerElement.style.position = 'absolute';
    timerElement.style.top = '10px';
    timerElement.style.right = '140px';
    timerElement.style.color = 'white';
    timerElement.style.fontSize = '24px';
    timerElement.style.fontFamily = 'Arial, sans-serif';
    timerElement.style.padding = '10px';
    timerElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    timerElement.style.borderRadius = '5px';
    document.body.appendChild(timerElement);

    // 創建分數元素
    const scoreElement = document.createElement('div');
    scoreElement.id = 'score';
    scoreElement.style.position = 'absolute';
    scoreElement.style.top = '200px';
    scoreElement.style.left = '10px';
    scoreElement.style.color = 'white';
    scoreElement.style.fontSize = '24px';
    scoreElement.style.fontFamily = 'Arial, sans-serif';
    scoreElement.style.padding = '10px';
    scoreElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    scoreElement.style.borderRadius = '5px';
    document.body.appendChild(scoreElement);

    // 開始遊戲
    startGame();
}

// 初始化遊戲
initGame();

animate(); 