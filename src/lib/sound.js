let audioContext = null;
let unlocked = false;
let enabled = true;

function getAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }
  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      return null;
    }
    audioContext = new AudioCtor();
  }
  return audioContext;
}

export async function unlockSound() {
  const context = getAudioContext();
  if (!context) {
    return;
  }
  if (context.state === "suspended") {
    await context.resume();
  }
  unlocked = true;
}

export function setSoundEnabled(nextEnabled) {
  enabled = nextEnabled;
}

function playTone({
  frequency,
  type = "triangle",
  duration = 0.12,
  gain = 0.045,
  delay = 0,
}) {
  const context = getAudioContext();
  if (!context || !enabled || !unlocked) {
    return;
  }

  const startTime = context.currentTime + delay;
  const endTime = startTime + duration;
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(gain, startTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(endTime);
}

export function playSound(eventName) {
  switch (eventName) {
    case "move":
      playTone({ frequency: 392, duration: 0.07, gain: 0.04 });
      playTone({ frequency: 523.25, duration: 0.09, gain: 0.03, delay: 0.05 });
      break;
    case "capture":
      playTone({ frequency: 220, type: "sawtooth", duration: 0.09, gain: 0.035 });
      playTone({ frequency: 329.63, type: "triangle", duration: 0.12, gain: 0.03, delay: 0.045 });
      break;
    case "check":
      playTone({ frequency: 523.25, duration: 0.1, gain: 0.032 });
      playTone({ frequency: 622.25, duration: 0.14, gain: 0.03, delay: 0.06 });
      break;
    case "rule-pick":
      playTone({ frequency: 349.23, duration: 0.08, gain: 0.032 });
      playTone({ frequency: 440, duration: 0.08, gain: 0.03, delay: 0.05 });
      playTone({ frequency: 587.33, duration: 0.1, gain: 0.028, delay: 0.1 });
      break;
    case "rule-activate":
      playTone({ frequency: 261.63, type: "sine", duration: 0.12, gain: 0.03 });
      playTone({ frequency: 392, type: "triangle", duration: 0.16, gain: 0.03, delay: 0.06 });
      playTone({ frequency: 659.25, type: "triangle", duration: 0.18, gain: 0.025, delay: 0.12 });
      break;
    default:
      break;
  }
}
