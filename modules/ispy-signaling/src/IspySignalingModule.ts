import { NativeModule, requireNativeModule } from 'expo';

import type { IspySignalingEvents, ServerStartResult } from './IspySignaling.types';

declare class IspySignalingModuleType extends NativeModule<IspySignalingEvents> {
  startServer(port: number, pin: string): Promise<ServerStartResult>;
  stopServer(): Promise<void>;
  startAdvertising(name: string, port: number): Promise<void>;
  stopAdvertising(): Promise<void>;
  startBrowse(): Promise<void>;
  stopBrowse(): Promise<void>;
  sendToViewer(json: string): Promise<boolean>;
  sendOffer(sdp: string): Promise<boolean>;
  sendIce(candidate: string, sdpMid?: string | null, sdpMLineIndex?: number | null): Promise<boolean>;
  sendBye(): Promise<boolean>;
  disconnectViewer(): Promise<void>;
  getLanAddress(): string;
  isServerRunning(): boolean;
}

export default requireNativeModule<IspySignalingModuleType>('IspySignaling');
