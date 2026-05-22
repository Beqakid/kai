export interface KaiSpeechToTextProvider {
  transcribe(audio: ArrayBuffer): Promise<string>;
}

export interface KaiTextToSpeechProvider {
  synthesize(text: string, language: string): Promise<ArrayBuffer>;
}

export interface KaiVoiceRuntime {
  pushToTalkEnabled: boolean;
  wakewordEnabled: false;
  interruptiblePlaybackEnabled: boolean;
  scaffoldUiEnabled: boolean;
  recordsAudio: boolean;
  requiresConsentBeforeRecording: true;
}

export const disabledKaiVoiceRuntime: KaiVoiceRuntime = {
  pushToTalkEnabled: false,
  wakewordEnabled: false,
  interruptiblePlaybackEnabled: false,
  scaffoldUiEnabled: false,
  recordsAudio: false,
  requiresConsentBeforeRecording: true,
};

export const scaffoldKaiVoiceRuntime: KaiVoiceRuntime = {
  pushToTalkEnabled: false,
  wakewordEnabled: false,
  interruptiblePlaybackEnabled: false,
  scaffoldUiEnabled: true,
  recordsAudio: false,
  requiresConsentBeforeRecording: true,
};

export const futureVoiceChecklist = [
  "explicit consent before recording",
  "push-to-talk control",
  "live transcript",
  "mute and stop controls",
  "speech-to-text provider",
  "text-to-speech provider",
  "interruptible playback",
  "audit logging for voice sessions",
] as const;
