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
}

export const disabledKaiVoiceRuntime: KaiVoiceRuntime = {
  pushToTalkEnabled: false,
  wakewordEnabled: false,
  interruptiblePlaybackEnabled: false,
};
