/**
 * AudioWorklet processor for converting microphone input to PCM 16kHz mono.
 * This runs in the audio rendering thread for low-latency processing.
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 1600; // 100ms at 16kHz = 1600 samples
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // Mono channel

    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bufferIndex++] = channelData[i];

      if (this.bufferIndex >= this.bufferSize) {
        // Convert float32 [-1, 1] to int16 PCM
        const pcmData = new Int16Array(this.bufferSize);
        for (let j = 0; j < this.bufferSize; j++) {
          const sample = Math.max(-1, Math.min(1, this.buffer[j]));
          pcmData[j] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }

        // Send PCM data to main thread
        this.port.postMessage(
          { type: "pcm", data: pcmData.buffer },
          [pcmData.buffer]
        );

        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
