import { RelayServer } from "https://www.chirimen.org/remote-connection/js/beta/RelayServer.js";

const CHANNEL_NAME = "chirimenLockMotor"; // チャンネル名はここ

const connectionStatus = document.getElementById("connectionStatus");
const lockState = document.getElementById("lockState");
const sensorState = document.getElementById("sensorState");
const motorState = document.getElementById("motorState");
const messageDiv = document.getElementById("messageDiv");
const unlockButton = document.getElementById("unlockButton");
const lockButton = document.getElementById("lockButton");
const motorOnButton = document.getElementById("motorOnButton");
const motorOffButton = document.getElementById("motorOffButton");

function setMessage(text) {
  messageDiv.textContent = text;
}

function renderLock(state) {
  const unlocked = state === "UNLOCK";
  lockState.textContent = state;
  lockState.classList.toggle("lock-off", unlocked);
  lockState.classList.toggle("lock-on", !unlocked);
}

function renderSensor(state) {
  sensorState.textContent = state;
}

function renderMotor(data) {
  motorState.textContent = data.state;
  if (data.state === "BLOCKED") {
    setMessage("ロック中のためモーターは動きませんでした");
    return;
  }
  if (data.state === "ON") {
    setMessage("モーターを回しました");
    return;
  }
  if (data.state === "OFF") {
    setMessage("モーターを止めました");
  }
}

const relay = RelayServer("chirimentest", "chirimenSocket");
const channel = await relay.subscribe(CHANNEL_NAME);

connectionStatus.textContent = "接続済み";
connectionStatus.classList.remove("status-wait");
connectionStatus.classList.add("status-ok");
setMessage("web socketリレーサービスに接続しました");
channel.send({ type: "sync" });

channel.onmessage = ({ data }) => {
  if (!data || typeof data !== "object") return;

  if (data.type === "lock") {
    renderLock(data.state);
    setMessage(`ロック状態を ${data.state} にしました`);
    return;
  }
  if (data.type === "sensor") {
    renderSensor(data.state);
    setMessage(`センサーが ${data.state} になりました`);
    return;
  }
  if (data.type === "motor" && data.state) {
    renderMotor(data);
  }
};

function sendLock(state) {
  channel.send({ type: "lock", state });
  renderLock(state);
  setMessage(`${state} を送信しました`);
}

function sendMotor(command) {
  channel.send({ type: "motor", command });
  setMessage(`モーター ${command} を送信しました`);
}

unlockButton.addEventListener("click", () => sendLock("UNLOCK"));
lockButton.addEventListener("click", () => sendLock("LOCK"));
motorOnButton.addEventListener("click", () => sendMotor("ON"));
motorOffButton.addEventListener("click", () => sendMotor("OFF"));
