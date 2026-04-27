import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/*
  BOBLICRAFT 3D - VERSION FUNCIONAL COMPLETA
  Creado por: Philippe Baudrit Penón y Margarita Penón

  Dependencias necesarias en CodeSandbox:
  three
  @react-three/fiber
  react
  react-dom

  Controles PC:
  WASD/Flechas = moverse o manejar
  Mouse = apuntar
  Click = disparar
  Click derecho = minar
  B = construir bloque
  V = pedir vehículo
  E = subir/bajar vehículo
  F = cambiar vista
  Q/R = girar cámara
*/

const CREATOR = "Philippe Baudrit y Margarita Penón";
const WORLD_SIZE = 34;
const DAY_LENGTH_MS = 780000; // 13 min total: 8 día + 5 noche aprox.
const NIGHT_START = 0.61;

const BLOCKS = {
  grass: { name: "Pasto", color: "#55aa3a" },
  dirt: { name: "Tierra", color: "#8b5a2b" },
  stone: { name: "Piedra", color: "#777777" },
  wood: { name: "Madera", color: "#7a4a22" },
  brick: { name: "Ladrillo", color: "#a43b32" },
  leaves: { name: "Hojas", color: "#2f7d32" },
};

const HOTBAR = ["grass", "dirt", "stone", "wood", "brick"];

const WEAPONS = {
  pistol: {
    name: "Pistola",
    emoji: "🔫",
    damage: 20,
    speed: 18,
    cooldown: 280,
    color: "#222222",
  },
  rifle: {
    name: "Rifle",
    emoji: "🪖",
    damage: 34,
    speed: 24,
    cooldown: 460,
    color: "#4b321e",
  },
  laser: {
    name: "Láser",
    emoji: "⚡",
    damage: 15,
    speed: 32,
    cooldown: 150,
    color: "#35e8ff",
  },
  cannon: {
    name: "Cañón",
    emoji: "💥",
    damage: 55,
    speed: 14,
    cooldown: 850,
    color: "#111111",
  },
};

const CRAFTS = [
  {
    name: "Refugio",
    cost: { wood: 5, dirt: 4 },
    reward: { brick: 2 },
    coins: 2,
  },
  {
    name: "Kit piedra",
    cost: { stone: 6, wood: 2 },
    reward: { brick: 3 },
    coins: 3,
  },
  {
    name: "Camuflaje",
    cost: { leaves: 4, wood: 1 },
    reward: { grass: 5 },
    coins: 2,
  },
];

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function rand(x, z) {
  return (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
}
function groundHeight(x, z) {
  return Math.floor(Math.sin(x * 0.18) * 1.4 + Math.cos(z * 0.14) * 1.2);
}
function key(x, y, z) {
  return `${x},${y},${z}`;
}

function createAudio() {
  let ctx = null,
    master = null,
    music = null,
    timer = null,
    soundOn = true,
    musicOn = true;
  const init = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      music = ctx.createGain();
      music.gain.value = 0.1;
      music.connect(master);
    }
    if (ctx.state === "suspended") ctx.resume();
  };
  const tone = (f, d = 0.12, type = "square", vol = 0.15, dest = null) => {
    if (!soundOn) return;
    init();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d);
    o.connect(g);
    g.connect(dest || master);
    o.start();
    o.stop(ctx.currentTime + d + 0.03);
  };
  return {
    init,
    shot: () => tone(520, 0.06, "square", 0.13),
    pickup: () => {
      tone(330, 0.07, "triangle", 0.12);
      setTimeout(() => tone(440, 0.08, "triangle", 0.1), 60);
    },
    coin: () => {
      tone(880, 0.07, "square", 0.12);
      setTimeout(() => tone(1320, 0.09, "square", 0.1), 80);
    },
    hit: () => tone(170, 0.12, "sawtooth", 0.12),
    startMusic: () => {
      if (timer || !musicOn || !soundOn) return;
      init();
      const notes = [196, 247, 294, 247, 220, 262, 330, 262];
      let i = 0;
      timer = setInterval(() => {
        if (musicOn && soundOn)
          tone(notes[i++ % notes.length], 0.18, "square", 0.04, music);
      }, 320);
    },
    toggleMusic: () => {
      musicOn = !musicOn;
      if (!musicOn && timer) {
        clearInterval(timer);
        timer = null;
      }
      return musicOn;
    },
    toggleSound: () => {
      soundOn = !soundOn;
      if (!soundOn && timer) {
        clearInterval(timer);
        timer = null;
      }
      return soundOn;
    },
  };
}

function buildInitialWorld() {
  const blocks = new Map();
  for (let x = -WORLD_SIZE; x <= WORLD_SIZE; x++) {
    for (let z = -WORLD_SIZE; z <= WORLD_SIZE; z++) {
      const h = groundHeight(x, z);
      blocks.set(key(x, h, z), Math.abs(rand(x, z)) > 0.75 ? "stone" : "grass");
      blocks.set(key(x, h - 1, z), "dirt");
      if (Math.abs(rand(x + 9, z - 4)) > 0.96) {
        blocks.set(key(x, h + 1, z), "wood");
        blocks.set(key(x, h + 2, z), "wood");
        blocks.set(key(x, h + 3, z), "leaves");
        blocks.set(key(x + 1, h + 3, z), "leaves");
        blocks.set(key(x - 1, h + 3, z), "leaves");
        blocks.set(key(x, h + 3, z + 1), "leaves");
        blocks.set(key(x, h + 3, z - 1), "leaves");
      }
    }
  }
  return blocks;
}

function Block({ b, onMine }) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: BLOCKS[b.type]?.color || "white",
        roughness: 1,
      }),
    [b.type]
  );
  return (
    <mesh
      position={[b.x, b.y, b.z]}
      material={mat}
      castShadow
      receiveShadow
      onContextMenu={(e) => {
        e.stopPropagation();
        onMine();
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

function Player({ p, yaw, moving, driving, weapon }) {
  if (driving) return null;
  const walk = moving ? Math.sin(Date.now() * 0.012) * 0.35 : 0;
  const gun = WEAPONS[weapon] || WEAPONS.pistol;
  return (
    <group position={[p.x, p.y, p.z]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[0.55, 0.85, 0.35]} />
        <meshStandardMaterial color="#2266d8" />
      </mesh>
      <mesh position={[0, 1.55, 0]} castShadow>
        <boxGeometry args={[0.48, 0.48, 0.48]} />
        <meshStandardMaterial color="#f0c28b" />
      </mesh>
      <mesh position={[0, 1.83, 0]} castShadow>
        <boxGeometry args={[0.54, 0.16, 0.54]} />
        <meshStandardMaterial color="#2b180d" />
      </mesh>
      <mesh position={[-0.18, 0.35, 0.08]} rotation={[walk, 0, 0]} castShadow>
        <boxGeometry args={[0.18, 0.65, 0.2]} />
        <meshStandardMaterial color="#143b82" />
      </mesh>
      <mesh position={[0.18, 0.35, -0.08]} rotation={[-walk, 0, 0]} castShadow>
        <boxGeometry args={[0.18, 0.65, 0.2]} />
        <meshStandardMaterial color="#143b82" />
      </mesh>
      <mesh
        position={[-0.42, 0.95, 0]}
        rotation={[-walk * 0.5, 0, 0]}
        castShadow
      >
        <boxGeometry args={[0.18, 0.62, 0.2]} />
        <meshStandardMaterial color="#f0c28b" />
      </mesh>
      <group position={[0.43, 1.02, -0.1]} rotation={[-0.35, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.18, 0.58, 0.2]} />
          <meshStandardMaterial color="#f0c28b" />
        </mesh>
        <mesh position={[0.02, -0.3, -0.28]} castShadow>
          <boxGeometry
            args={
              weapon === "cannon"
                ? [0.35, 0.24, 0.75]
                : weapon === "rifle"
                ? [0.18, 0.16, 0.95]
                : [0.16, 0.14, 0.48]
            }
          />
          <meshStandardMaterial
            color={gun.color}
            emissive={weapon === "laser" ? "#0c6670" : "#000"}
          />
        </mesh>
      </group>
    </group>
  );
}

function Enemy({ e }) {
  return (
    <group position={[e.x, e.y, e.z]}>
      <mesh castShadow>
        <boxGeometry args={[0.7, 1.1, 0.7]} />
        <meshStandardMaterial color="#3b2244" emissive="#12001c" />
      </mesh>
      <pointLight intensity={0.7} distance={4} color="#63ff3d" />
    </group>
  );
}
function Animal({ a }) {
  const good = a.kind === "good";
  return (
    <group position={[a.x, a.y, a.z]}>
      <mesh castShadow>
        <boxGeometry args={[0.85, 0.5, 1]} />
        <meshStandardMaterial color={good ? "#f4f0dc" : "#7d2929"} />
      </mesh>
      <mesh position={[0, 0.35, -0.45]}>
        <boxGeometry args={[0.5, 0.4, 0.4]} />
        <meshStandardMaterial color={good ? "white" : "#4b1515"} />
      </mesh>
    </group>
  );
}
function Car({ c }) {
  return (
    <group position={[c.x, c.y, c.z]} rotation={[0, c.angle, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.6, 0.55, 2.4]} />
        <meshStandardMaterial color={c.color} />
      </mesh>
      <mesh position={[0, 0.48, -0.25]}>
        <boxGeometry args={[1.1, 0.45, 1]} />
        <meshStandardMaterial color="#2b3b55" />
      </mesh>
      <pointLight
        position={[0, 0.1, 1.3]}
        intensity={c.light ? 2 : 0}
        distance={7}
      />
    </group>
  );
}
function Bullet({ b }) {
  const color =
    b.weapon === "laser"
      ? "#35e8ff"
      : b.weapon === "cannon"
      ? "#ff4d2e"
      : "#ffe85c";
  return (
    <mesh position={[b.x, b.y, b.z]}>
      <boxGeometry
        args={[
          b.weapon === "cannon" ? 0.28 : 0.16,
          b.weapon === "cannon" ? 0.28 : 0.16,
          b.weapon === "cannon" ? 0.28 : 0.16,
        ]}
      />
      <meshStandardMaterial color={color} emissive={color} />
    </mesh>
  );
}
function Drop({ d }) {
  return (
    <mesh position={[d.x, d.y, d.z]} rotation={[d.spin, d.spin, 0]}>
      <boxGeometry args={[0.42, 0.42, 0.42]} />
      <meshStandardMaterial color={BLOCKS[d.type]?.color || "white"} />
    </mesh>
  );
}
function Coin({ c }) {
  return (
    <mesh position={[c.x, c.y, c.z]} rotation={[0, c.spin, 0]}>
      <boxGeometry args={[0.3, 0.3, 0.08]} />
      <meshStandardMaterial color="#ffd84d" emissive="#6b5500" />
    </mesh>
  );
}

function Game({
  started,
  selectedBlock,
  selectedWeapon,
  inventoryRef,
  setInventory,
  stats,
  setStats,
  setMessage,
  mobile,
  audioRef,
}) {
  const { camera, gl } = useThree();
  const world = useRef(buildInitialWorld());
  const player = useRef(new THREE.Vector3(0, 2, 0));
  const yaw = useRef(0);
  const pitch = useRef(0);
  const view = useRef("follow");
  const keys = useRef({});
  const velocityY = useRef(0);
  const grounded = useRef(false);
  const driving = useRef(false);
  const vehicle = useRef(null);
  const vehicleSpeed = useRef(0);
  const vehicleAngle = useRef(0);
  const lastShot = useRef(0);
  const walk = useRef(false);

  const bullets = useRef([]),
    enemies = useRef([]),
    animals = useRef([]),
    cars = useRef([]),
    drops = useRef([]),
    coins = useRef([]);
  const [render, setRender] = useState({
    blocks: [],
    bullets: [],
    enemies: [],
    animals: [],
    cars: [],
    vehicle: null,
    drops: [],
    coins: [],
    player: { x: 0, y: 0, z: 0 },
    moving: false,
  });

  const groundYAt = (x, z) => {
    const gx = Math.floor(x),
      gz = Math.floor(z);
    for (let y = 8; y >= -3; y--)
      if (world.current.has(key(gx, y, gz))) return y + 1;
    return groundHeight(gx, gz) + 1;
  };
  const visibleBlocks = () => {
    const px = Math.floor(player.current.x),
      pz = Math.floor(player.current.z),
      arr = [];
    world.current.forEach((type, k) => {
      const [x, y, z] = k.split(",").map(Number);
      if (Math.abs(x - px) < 18 && Math.abs(z - pz) < 18 && y > -2 && y < 8)
        arr.push({ k, x, y, z, type });
    });
    return arr;
  };

  function shoot() {
    const w = WEAPONS[selectedWeapon];
    const now = performance.now();
    if (now - lastShot.current < w.cooldown) return;
    lastShot.current = now;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    bullets.current.push({
      id: Math.random(),
      weapon: selectedWeapon,
      damage: w.damage,
      x: camera.position.x,
      y: camera.position.y - 0.1,
      z: camera.position.z,
      vx: dir.x * w.speed,
      vy: dir.y * w.speed,
      vz: dir.z * w.speed,
      life: 1.1,
    });
    audioRef.current?.shot();
  }

  function mine() {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    for (let i = 0; i < 55; i++) {
      const p = ray.ray.origin
        .clone()
        .add(ray.ray.direction.clone().multiplyScalar(i * 0.13));
      const bx = Math.floor(p.x + 0.5),
        by = Math.floor(p.y + 0.5),
        bz = Math.floor(p.z + 0.5),
        k = key(bx, by, bz);
      const type = world.current.get(k);
      if (type) {
        world.current.delete(k);
        drops.current.push({
          id: Math.random(),
          type,
          x: bx,
          y: by + 0.7,
          z: bz,
          spin: 0,
          life: 60,
        });
        setStats((s) => ({ ...s, mined: s.mined + 1 }));
        setMessage(`${BLOCKS[type].name} al suelo. Pasa encima para recoger.`);
        audioRef.current?.pickup();
        return;
      }
    }
  }

  function place() {
    if ((inventoryRef.current[selectedBlock] || 0) <= 0)
      return setMessage(`No tienes ${BLOCKS[selectedBlock].name}.`);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const tx = Math.floor(player.current.x + dir.x * 2 + 0.5),
      tz = Math.floor(player.current.z + dir.z * 2 + 0.5),
      ty = Math.floor(groundYAt(tx, tz));
    const k = key(tx, ty, tz);
    if (!world.current.has(k)) {
      world.current.set(k, selectedBlock);
      setInventory((old) => ({
        ...old,
        [selectedBlock]: old[selectedBlock] - 1,
      }));
      audioRef.current?.pickup();
    }
  }

  function summonVehicle() {
    const x = player.current.x + 2,
      z = player.current.z + 2;
    vehicle.current = {
      id: "v",
      x,
      y: groundYAt(x, z) + 0.45,
      z,
      angle: yaw.current,
      color: "#18a8ff",
      light: true,
    };
    setMessage("Vehículo solicitado. Acércate y presiona Subir.");
  }
  function toggleDrive() {
    if (!vehicle.current) return summonVehicle();
    if (
      !driving.current &&
      Math.hypot(
        vehicle.current.x - player.current.x,
        vehicle.current.z - player.current.z
      ) > 3
    )
      return setMessage("Acércate más al vehículo.");
    driving.current = !driving.current;
    vehicleSpeed.current = 0;
    vehicleAngle.current = yaw.current;
    setStats((s) => ({ ...s, driving: driving.current }));
  }
  function changeView() {
    view.current =
      view.current === "first"
        ? "third"
        : view.current === "third"
        ? "follow"
        : view.current === "follow"
        ? "top"
        : "first";
    setStats((s) => ({ ...s, view: view.current }));
  }

  useEffect(() => {
    const down = (e) => {
      keys.current[e.code] = true;
      if (e.code === "KeyB") place();
      if (e.code === "KeyV") summonVehicle();
      if (e.code === "KeyE") toggleDrive();
      if (e.code === "KeyF") changeView();
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.code
        )
      )
        e.preventDefault();
    };
    const up = (e) => {
      keys.current[e.code] = false;
    };
    const move = (e) => {
      if (!started) return;
      yaw.current -= e.movementX * 0.003;
      pitch.current = clamp(pitch.current - e.movementY * 0.002, -0.6, 0.55);
    };
    const mouse = (e) => {
      if (!started) return;
      if (e.button === 0) shoot();
      if (e.button === 2) mine();
    };
    const context = (e) => e.preventDefault();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", move);
    gl.domElement.addEventListener("mousedown", mouse);
    gl.domElement.addEventListener("contextmenu", context);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", move);
      gl.domElement.removeEventListener("mousedown", mouse);
      gl.domElement.removeEventListener("contextmenu", context);
    };
  }, [started, selectedBlock, selectedWeapon]);

  useEffect(() => {
    if (mobile.action === "shoot") shoot();
    if (mobile.action === "mine") mine();
    if (mobile.action === "place") place();
    if (mobile.action === "vehicle") summonVehicle();
    if (mobile.action === "drive") toggleDrive();
    if (mobile.action === "view") changeView();
  }, [mobile.token]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.033);
    if (!started) {
      camera.position.set(6, 7, 9);
      camera.lookAt(0, 1, 0);
      setRender((r) => ({ ...r, blocks: visibleBlocks() }));
      return;
    }
    const cycle = (performance.now() % DAY_LENGTH_MS) / DAY_LENGTH_MS,
      isNight = cycle > NIGHT_START;
    if (keys.current.KeyQ || mobile.turnLeft) yaw.current += dt * 2;
    if (keys.current.KeyR || mobile.turnRight) yaw.current -= dt * 2;
    const forward = new THREE.Vector3(
      Math.sin(yaw.current),
      0,
      -Math.cos(yaw.current)
    ).normalize();
    const right = new THREE.Vector3(
      Math.cos(yaw.current),
      0,
      Math.sin(yaw.current)
    ).normalize();
    const moving =
      keys.current.KeyW ||
      keys.current.ArrowUp ||
      keys.current.KeyS ||
      keys.current.ArrowDown ||
      keys.current.KeyA ||
      keys.current.ArrowLeft ||
      keys.current.KeyD ||
      keys.current.ArrowRight ||
      mobile.forward ||
      mobile.back ||
      mobile.left ||
      mobile.right;
    walk.current = !!moving;

    if (driving.current && vehicle.current) {
      const acc = keys.current.KeyW || keys.current.ArrowUp || mobile.forward,
        brake = keys.current.KeyS || keys.current.ArrowDown || mobile.back;
      if (acc) vehicleSpeed.current += 16 * dt;
      else if (brake) vehicleSpeed.current -= 20 * dt;
      else vehicleSpeed.current *= 0.94;
      vehicleSpeed.current = clamp(vehicleSpeed.current, -5, 14);
      if (keys.current.KeyA || keys.current.ArrowLeft || mobile.left)
        vehicleAngle.current += dt * 2.2;
      if (keys.current.KeyD || keys.current.ArrowRight || mobile.right)
        vehicleAngle.current -= dt * 2.2;
      player.current.x +=
        Math.sin(vehicleAngle.current) * vehicleSpeed.current * dt;
      player.current.z +=
        -Math.cos(vehicleAngle.current) * vehicleSpeed.current * dt;
      yaw.current = vehicleAngle.current;
      vehicle.current.x = player.current.x;
      vehicle.current.z = player.current.z;
      vehicle.current.y = groundYAt(player.current.x, player.current.z) + 0.45;
      vehicle.current.angle = vehicleAngle.current;
    } else {
      const move = new THREE.Vector3();
      if (keys.current.KeyW || keys.current.ArrowUp || mobile.forward)
        move.add(forward);
      if (keys.current.KeyS || keys.current.ArrowDown || mobile.back)
        move.sub(forward);
      if (keys.current.KeyA || keys.current.ArrowLeft || mobile.left)
        move.sub(right);
      if (keys.current.KeyD || keys.current.ArrowRight || mobile.right)
        move.add(right);
      if (move.length()) move.normalize();
      player.current.x += move.x * 4.8 * dt;
      player.current.z += move.z * 4.8 * dt;
      if ((keys.current.Space || mobile.jump) && grounded.current) {
        velocityY.current = 8;
        grounded.current = false;
      }
    }
    velocityY.current -= 20 * dt;
    player.current.y += velocityY.current * dt;
    const gy = groundYAt(player.current.x, player.current.z);
    if (player.current.y <= gy) {
      player.current.y = gy;
      velocityY.current = 0;
      grounded.current = true;
    }

    if (view.current === "first") {
      camera.position.set(
        player.current.x,
        player.current.y + 1.6,
        player.current.z
      );
      camera.lookAt(
        player.current.x + forward.x * 5,
        player.current.y + 1.3 + Math.sin(pitch.current) * 4,
        player.current.z + forward.z * 5
      );
    } else if (view.current === "third") {
      camera.position.set(
        player.current.x - forward.x * 6,
        player.current.y + 3.5,
        player.current.z - forward.z * 6
      );
      camera.lookAt(player.current.x, player.current.y + 1.2, player.current.z);
    } else if (view.current === "follow") {
      camera.position.set(
        player.current.x - forward.x * 8,
        player.current.y + 4.7,
        player.current.z - forward.z * 8
      );
      camera.lookAt(player.current.x, player.current.y + 1.1, player.current.z);
    } else {
      camera.position.set(
        player.current.x,
        player.current.y + 13,
        player.current.z + 0.01
      );
      camera.lookAt(player.current.x, player.current.y, player.current.z);
    }

    if (isNight && enemies.current.length < 8 && Math.random() < 0.025) {
      const a = Math.random() * Math.PI * 2,
        d = 10 + Math.random() * 12,
        x = player.current.x + Math.cos(a) * d,
        z = player.current.z + Math.sin(a) * d;
      enemies.current.push({
        id: Math.random(),
        x,
        y: groundYAt(x, z) + 0.55,
        z,
        hp: 45,
      });
    }
    if (!isNight) enemies.current = [];
    if (animals.current.length < 10 && Math.random() < 0.01) {
      const a = Math.random() * Math.PI * 2,
        d = 8 + Math.random() * 14,
        x = player.current.x + Math.cos(a) * d,
        z = player.current.z + Math.sin(a) * d;
      animals.current.push({
        id: Math.random(),
        kind: Math.random() > 0.35 ? "good" : "bad",
        x,
        y: groundYAt(x, z) + 0.35,
        z,
        hp: 20,
      });
    }
    if (cars.current.length < 3 && Math.random() < 0.005) {
      const x = player.current.x + 18,
        z = player.current.z + (Math.random() - 0.5) * 14;
      cars.current.push({
        id: Math.random(),
        x,
        y: groundYAt(x, z) + 0.45,
        z,
        angle: Math.PI / 2,
        color: "#c84630",
        light: isNight,
        speed: 3,
        life: 16,
      });
    }

    enemies.current.forEach((e) => {
      const dx = player.current.x - e.x,
        dz = player.current.z - e.z,
        l = Math.hypot(dx, dz) || 1;
      e.x += (dx / l) * dt * 2;
      e.z += (dz / l) * dt * 2;
      e.y = groundYAt(e.x, e.z) + 0.55;
      if (l < 0.9)
        setStats((s) => ({ ...s, hp: clamp(s.hp - dt * 12, 0, 100) }));
    });
    animals.current.forEach((a) => {
      if (a.kind === "bad") {
        const dx = player.current.x - a.x,
          dz = player.current.z - a.z,
          l = Math.hypot(dx, dz) || 1;
        a.x += (dx / l) * dt;
        a.z += (dz / l) * dt;
        if (l < 0.9)
          setStats((s) => ({ ...s, hp: clamp(s.hp - dt * 5, 0, 100) }));
      } else if (
        Math.hypot(a.x - player.current.x, a.z - player.current.z) < 1.1
      ) {
        drops.current.push({
          id: Math.random(),
          type: "leaves",
          x: a.x,
          y: a.y + 0.5,
          z: a.z,
          spin: 0,
          life: 40,
        });
        coins.current.push({
          id: Math.random(),
          x: a.x + 0.3,
          y: a.y + 0.7,
          z: a.z,
          spin: 0,
          life: 15,
          value: 1,
        });
        a.hp = 0;
      }
      a.y = groundYAt(a.x, a.z) + 0.35;
    });
    cars.current.forEach((c) => {
      c.x -= c.speed * dt;
      c.life -= dt;
      c.y = groundYAt(c.x, c.z) + 0.45;
    });
    bullets.current.forEach((b) => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.life -= dt;
      enemies.current.forEach((e) => {
        if (Math.hypot(e.x - b.x, e.y - b.y, e.z - b.z) < 0.8) {
          e.hp -= b.damage;
          b.life = 0;
          audioRef.current?.hit();
        }
      });
      animals.current.forEach((a) => {
        if (
          a.kind === "bad" &&
          Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.8
        ) {
          a.hp -= b.damage;
          b.life = 0;
          audioRef.current?.hit();
        }
      });
    });
    const before = enemies.current.length;
    enemies.current = enemies.current.filter((e) => e.hp > 0);
    if (before > enemies.current.length) {
      setStats((s) => ({
        ...s,
        enemies: s.enemies + before - enemies.current.length,
        coins: s.coins + 5,
      }));
      audioRef.current?.coin();
    }
    animals.current = animals.current.filter(
      (a) =>
        a.hp > 0 &&
        Math.hypot(a.x - player.current.x, a.z - player.current.z) < 50
    );
    cars.current = cars.current.filter((c) => c.life > 0);
    bullets.current = bullets.current.filter((b) => b.life > 0);
    drops.current.forEach((d) => {
      d.spin += dt * 4;
      d.life -= dt;
      d.y = groundYAt(d.x, d.z) + 0.45;
      if (Math.hypot(d.x - player.current.x, d.z - player.current.z) < 1.15) {
        setInventory((o) => ({ ...o, [d.type]: (o[d.type] || 0) + 1 }));
        audioRef.current?.pickup();
        d.life = 0;
      }
    });
    drops.current = drops.current.filter((d) => d.life > 0);
    coins.current.forEach((c) => {
      c.spin += dt * 8;
      c.life -= dt;
      c.y += dt;
      if (Math.hypot(c.x - player.current.x, c.z - player.current.z) < 1.1) {
        setStats((s) => ({ ...s, coins: s.coins + (c.value || 1) }));
        audioRef.current?.coin();
        c.life = 0;
      }
    });
    coins.current = coins.current.filter((c) => c.life > 0);

    setRender({
      blocks: visibleBlocks(),
      bullets: [...bullets.current],
      enemies: [...enemies.current],
      animals: [...animals.current],
      cars: [...cars.current],
      vehicle: vehicle.current ? { ...vehicle.current } : null,
      drops: [...drops.current],
      coins: [...coins.current],
      player: { x: player.current.x, y: player.current.y, z: player.current.z },
      moving: walk.current,
    });
    setStats((s) => ({
      ...s,
      mode: isNight ? "Noche" : "Día",
      driving: driving.current,
      view: view.current,
      distance: Math.max(
        s.distance,
        Math.floor(Math.hypot(player.current.x, player.current.z))
      ),
    }));
  });

  return (
    <>
      <ambientLight intensity={stats.mode === "Noche" ? 0.35 : 0.75} />
      <directionalLight
        position={[8, 16, 6]}
        intensity={stats.mode === "Noche" ? 0.35 : 1.3}
        castShadow
      />
      <fog
        attach="fog"
        args={[stats.mode === "Noche" ? "#0b1028" : "#b9e4ff", 18, 65]}
      />
      <color
        attach="background"
        args={[stats.mode === "Noche" ? "#0b1028" : "#87cfff"]}
      />
      {render.blocks.map((b) => (
        <Block key={b.k} b={b} onMine={mine} />
      ))}
      <Player
        p={render.player}
        yaw={yaw.current}
        moving={render.moving}
        driving={driving.current && view.current !== "follow"}
        weapon={selectedWeapon}
      />
      {render.enemies.map((e) => (
        <Enemy key={e.id} e={e} />
      ))}
      {render.animals.map((a) => (
        <Animal key={a.id} a={a} />
      ))}
      {render.cars.map((c) => (
        <Car key={c.id} c={c} />
      ))}
      {render.vehicle && <Car c={render.vehicle} />}
      {render.bullets.map((b) => (
        <Bullet key={b.id} b={b} />
      ))}
      {render.drops.map((d) => (
        <Drop key={d.id} d={d} />
      ))}
      {render.coins.map((c) => (
        <Coin key={c.id} c={c} />
      ))}
    </>
  );
}

export default function App() {
  const audioRef = useRef(null);
  const inventoryRef = useRef({
    grass: 10,
    dirt: 10,
    stone: 8,
    wood: 6,
    brick: 3,
    leaves: 0,
  });
  const [inventory, setInventoryState] = useState(inventoryRef.current);
  const [started, setStarted] = useState(false);
  const [panel, setPanel] = useState("inventario");
  const [selectedBlock, setSelectedBlock] = useState("dirt");
  const [selectedWeapon, setSelectedWeapon] = useState("pistol");
  const [message, setMessage] = useState(
    "Recolecta de día, construye y sobrevive de noche."
  );
  const [stats, setStats] = useState({
    hp: 100,
    distance: 0,
    mined: 0,
    enemies: 0,
    coins: 0,
    mode: "Día",
    driving: false,
    view: "follow",
  });
  const [mobile, setMobile] = useState({});
  const [hidden, setHidden] = useState(false);
  const [musicOn, setMusicOn] = useState(true);
  const [soundOn, setSoundOn] = useState(true);

  const setInventory = (updater) =>
    setInventoryState((old) => {
      const next = typeof updater === "function" ? updater(old) : updater;
      inventoryRef.current = next;
      return next;
    });
  const ensureAudio = () => {
    if (!audioRef.current) audioRef.current = createAudio();
    audioRef.current.init();
    return audioRef.current;
  };
  const action = (name) =>
    setMobile((m) => ({ ...m, action: name, token: Date.now() }));
  const press = (name, val) => setMobile((m) => ({ ...m, [name]: val }));

  function start() {
    setStarted(true);
    setMessage("Mouse apunta. Click dispara. F cambia vista.");
    try {
      ensureAudio().startMusic();
    } catch {}
  }
  function craft(c) {
    const ok = Object.entries(c.cost).every(
      ([m, q]) => (inventoryRef.current[m] || 0) >= q
    );
    if (!ok) return setMessage(`Faltan materiales para ${c.name}.`);
    const next = { ...inventoryRef.current };
    Object.entries(c.cost).forEach(([m, q]) => (next[m] -= q));
    Object.entries(c.reward).forEach(
      ([m, q]) => (next[m] = (next[m] || 0) + q)
    );
    setInventory(next);
    setStats((s) => ({ ...s, coins: s.coins + c.coins }));
    ensureAudio().coin();
    setMessage(`${c.name} creado.`);
  }

  return (
    <div style={styles.app}>
      <Canvas
        shadows
        dpr={[1, 1.2]}
        camera={{ fov: 72, position: [6, 7, 9], near: 0.1, far: 500 }}
        gl={{ antialias: false }}
        style={styles.canvas}
      >
        <Game
          started={started}
          selectedBlock={selectedBlock}
          selectedWeapon={selectedWeapon}
          inventoryRef={inventoryRef}
          setInventory={setInventory}
          stats={stats}
          setStats={setStats}
          setMessage={setMessage}
          mobile={mobile}
          audioRef={audioRef}
        />
      </Canvas>
      <div style={styles.cross}>
        <div style={styles.h} />
        <div style={styles.v} />
        <div style={styles.c} />
      </div>
      <div style={styles.credit}>Creado por: {CREATOR}</div>
      {!started && (
        <div style={styles.start}>
          <div style={styles.card}>
            <h1>BOBLICRAFT 3D</h1>
            <p>Mundo 3D, vehículos, armas, animales, construcción y sonidos.</p>
            <p style={{ color: "#ffe45e" }}>Creado por: {CREATOR}</p>
            <button onClick={start}>Iniciar aventura</button>
            <p>
              WASD/Flechas mover · Mouse apuntar · Click disparar · Click
              derecho minar · B construir · V vehículo · E subir · F vista.
            </p>
          </div>
        </div>
      )}
      <button style={styles.hide} onClick={() => setHidden(!hidden)}>
        {hidden ? "☰ Menú" : "✕ Ocultar"}
      </button>
      <button
        style={styles.music}
        onClick={() => {
          const v = ensureAudio().toggleMusic();
          setMusicOn(v);
        }}
      >
        {musicOn ? "🎵" : "🔇"}
      </button>
      <button
        style={styles.sound}
        onClick={() => {
          const v = ensureAudio().toggleSound();
          setSoundOn(v);
          if (!v) setMusicOn(false);
        }}
      >
        {soundOn ? "🔊" : "🔕"}
      </button>
      {!hidden && (
        <>
          <div style={styles.hud}>
            <span>❤️ {Math.round(stats.hp)}</span>
            <span>📍 {stats.distance}m</span>
            <span>⛏️ {stats.mined}</span>
            <span>👾 {stats.enemies}</span>
            <span>🪙 {stats.coins}</span>
            <span>{stats.mode === "Noche" ? "🌙 Noche" : "☀️ Día"}</span>
            <span>{stats.driving ? "🚙 Manejando" : "🚶 Caminando"}</span>
            <span>🎥 {stats.view}</span>
            <span>
              {WEAPONS[selectedWeapon].emoji} {WEAPONS[selectedWeapon].name}
            </span>
          </div>
          <div style={styles.panel}>
            <div style={styles.tabs}>
              <button onClick={() => setPanel("inventario")}>🎒</button>
              <button onClick={() => setPanel("craft")}>🔨</button>
              <button onClick={() => setPanel("armas")}>🔫</button>
              <button onClick={() => setPanel("ayuda")}>?</button>
            </div>
            {panel === "inventario" && (
              <div>
                <h3>Bloques</h3>
                {HOTBAR.map((b, i) => (
                  <button
                    key={b}
                    style={selectedBlock === b ? styles.active : styles.slot}
                    onClick={() => setSelectedBlock(b)}
                  >
                    <span
                      style={{
                        background: BLOCKS[b].color,
                        width: 18,
                        height: 18,
                        display: "inline-block",
                      }}
                    />{" "}
                    {i + 1} {BLOCKS[b].name} x{inventory[b] || 0}
                  </button>
                ))}
              </div>
            )}
            {panel === "craft" && (
              <div>
                <h3>Crafteo</h3>
                {CRAFTS.map((c) => (
                  <button
                    key={c.name}
                    style={styles.slot}
                    onClick={() => craft(c)}
                  >
                    <b>{c.name}</b> ·{" "}
                    {Object.entries(c.cost)
                      .map(([m, q]) => `${BLOCKS[m].name} ${q}`)
                      .join(" · ")}
                  </button>
                ))}
              </div>
            )}
            {panel === "armas" && (
              <div>
                <h3>Armas</h3>
                {Object.entries(WEAPONS).map(([id, w]) => (
                  <button
                    key={id}
                    style={selectedWeapon === id ? styles.active : styles.slot}
                    onClick={() => setSelectedWeapon(id)}
                  >
                    {w.emoji} <b>{w.name}</b> · daño {w.damage}
                  </button>
                ))}
              </div>
            )}
            {panel === "ayuda" && (
              <div>
                <p>Día: recoge materiales pasando encima y construye.</p>
                <p>Noche: enemigos aparecen.</p>
                <p>Vehículo: V pedir, E subir/bajar.</p>
                <p>F cambia vistas.</p>
              </div>
            )}
          </div>
          <div style={styles.msg}>{message}</div>
        </>
      )}
      <div style={styles.controls}>
        <div style={styles.pad}>
          <b>{stats.driving ? "🚙 Manejar" : "🚶 Mover"}</b>
          <button
            onPointerDown={() => press("forward", true)}
            onPointerUp={() => press("forward", false)}
          >
            ▲
          </button>
          <button
            onPointerDown={() => press("left", true)}
            onPointerUp={() => press("left", false)}
          >
            ◀
          </button>
          <button
            onPointerDown={() => press("back", true)}
            onPointerUp={() => press("back", false)}
          >
            ▼
          </button>
          <button
            onPointerDown={() => press("right", true)}
            onPointerUp={() => press("right", false)}
          >
            ▶
          </button>
          <button
            onPointerDown={() => press("turnLeft", true)}
            onPointerUp={() => press("turnLeft", false)}
          >
            ↺
          </button>
          <button
            onPointerDown={() => press("turnRight", true)}
            onPointerUp={() => press("turnRight", false)}
          >
            ↻
          </button>
        </div>
        <div style={styles.quick}>
          <button onClick={() => action("vehicle")}>🚙 Pedir</button>
          <button onClick={() => action("drive")}>
            {stats.driving ? "🚶 Bajar" : "🕹️ Subir"}
          </button>
          <button onClick={() => action("view")}>🎥 Vista</button>
          <button
            onPointerDown={() => press("jump", true)}
            onPointerUp={() => press("jump", false)}
          >
            ⤴ Brincar
          </button>
        </div>
        <div style={styles.actions}>
          <button onClick={() => action("shoot")}>🎯</button>
          <button onClick={() => action("mine")}>⛏️ Minar</button>
          <button onClick={() => action("place")}>🧱 Construir</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  app: {
    position: "fixed",
    inset: 0,
    overflow: "hidden",
    fontFamily: "Courier New, monospace",
    userSelect: "none",
  },
  canvas: { width: "100vw", height: "100vh", imageRendering: "pixelated" },
  cross: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 34,
    height: 34,
    transform: "translate(-50%,-50%)",
    pointerEvents: "none",
  },
  h: {
    position: "absolute",
    top: 16,
    width: 34,
    height: 3,
    background: "#fff",
  },
  v: {
    position: "absolute",
    left: 16,
    width: 3,
    height: 34,
    background: "#fff",
  },
  c: {
    position: "absolute",
    left: 14,
    top: 14,
    width: 7,
    height: 7,
    background: "#111",
  },
  credit: {
    position: "absolute",
    left: 12,
    bottom: 92,
    background: "rgba(0,0,0,.65)",
    color: "#ffe45e",
    padding: 8,
    border: "3px solid #fff",
    fontWeight: 900,
    fontSize: 12,
  },
  start: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    background: "rgba(0,0,0,.45)",
    zIndex: 50,
  },
  card: {
    background: "#1c2a20",
    color: "#fff",
    border: "5px solid #111",
    padding: 24,
    textAlign: "center",
    width: "min(92vw,620px)",
    boxShadow: "8px 8px 0 #000",
  },
  hide: { position: "absolute", top: 12, right: 12, zIndex: 20 },
  music: { position: "absolute", top: 58, right: 12, zIndex: 20 },
  sound: { position: "absolute", top: 104, right: 12, zIndex: 20 },
  hud: {
    position: "absolute",
    top: 12,
    left: 12,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    maxWidth: "calc(100vw - 160px)",
  },
  panel: {
    position: "absolute",
    left: 12,
    top: 68,
    width: 310,
    maxHeight: "calc(100vh - 240px)",
    overflow: "auto",
    background: "rgba(0,0,0,.7)",
    color: "#fff",
    padding: 10,
    border: "4px solid #111",
  },
  tabs: { display: "flex", gap: 6 },
  slot: { width: "100%", display: "block", margin: "6px 0", textAlign: "left" },
  active: {
    width: "100%",
    display: "block",
    margin: "6px 0",
    textAlign: "left",
    background: "#ffe45e",
  },
  msg: {
    position: "absolute",
    left: "50%",
    bottom: 18,
    transform: "translateX(-50%)",
    background: "rgba(0,0,0,.75)",
    color: "#fff",
    padding: 10,
    border: "3px solid #fff",
  },
  controls: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    display: "grid",
    gridTemplateColumns: "160px 1fr 150px",
    gap: 12,
    pointerEvents: "none",
  },
  pad: {
    pointerEvents: "auto",
    display: "grid",
    gridTemplateColumns: "52px 52px 52px",
    gap: 4,
  },
  quick: {
    pointerEvents: "auto",
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: 6,
    alignItems: "end",
  },
  actions: { pointerEvents: "auto", display: "grid", gap: 6 },
};

if (
  typeof document !== "undefined" &&
  !document.getElementById("boblicraft-final-css")
) {
  const s = document.createElement("style");
  s.id = "boblicraft-final-css";
  s.textContent = `button{font-family:'Courier New',monospace;font-weight:900;border:3px solid #111;background:rgba(255,255,255,.93);box-shadow:3px 3px 0 #111;min-height:42px;cursor:pointer} span{background:rgba(0,0,0,.65);color:#fff;padding:7px;border:2px solid rgba(255,255,255,.5)} @media(max-width:760px){div[style*="grid-template-columns: 160px"]{grid-template-columns:160px 1fr}div[style*="repeat(4"]{grid-column:1/3}}`;
  document.head.appendChild(s);
}
