import { NativeModule } from 'expo';

import type { IspySignalingEvents, ServerStartResult } from './IspySignaling.types';

class IspySignalingModuleWeb extends NativeModule<IspySignalingEvents> {
  async startServer(_port: number, _pin: string): Promise<ServerStartResult> {
    throw new Error('iSpy signaling server is not available on web');
  }

  async stopServer(): Promise<void> {}

  async startAdvertising(_name: string, _port: number): Promise<void> {}

  async stopAdvertising(): Promise<void> {}

  async startBrowse(): Promise<void> {}

  async stopBrowse(): Promise<void> {}

  async sendToViewer(_json: string): Promise<boolean> {
    return false;
  }

  async sendOffer(_sdp: string): Promise<boolean> {
    return false;
  }

  async sendIce(
    _candidate: string,
    _sdpMid?: string | null,
    _sdpMLineIndex?: number | null,
  ): Promise<boolean> {
    return false;
  }

  async sendBye(): Promise<boolean> {
    return false;
  }

  async disconnectViewer(): Promise<void> {}

  getLanAddress(): string {
    return '';
  }

  isServerRunning(): boolean {
    return false;
  }
}

export default new IspySignalingModuleWeb();
