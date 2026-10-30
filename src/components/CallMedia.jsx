import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  StartAudio,
  useTracks,
  useIsRecording,
} from "@livekit/components-react";

import { Track } from "livekit-client";
import "@livekit/components-styles";

const options = {
  adaptiveStream: true,
  dynacast: true,
};

const controls = {
  microphone: true,
  camera: true,
  screenShare: false,
  chat: false,
  leave: false,
};

function Stage({ onLeave }) {
  const tracks = useTracks([
    {
      source: Track.Source.Camera,
      withPlaceholder: true,
    },
  ]);

  const recording = useIsRecording();

  return (
    <>
      {recording && (
        <div
          className="td-call-recording"
          role="status"
        >
          ● Recording audio and video
        </div>
      )}

      <div className="td-call-grid">
        <GridLayout tracks={tracks}>
          <ParticipantTile />
        </GridLayout>
      </div>

      <RoomAudioRenderer />

      <StartAudio label="Tap to hear the call" />

      <div className="td-call-media-controls">
        <ControlBar controls={controls} />

        <button
          type="button"
          className="td-call-danger"
          onClick={onLeave}
        >
          Leave call
        </button>
      </div>
    </>
  );
}

export default function CallMedia({
  connection,
  onLeave,
  onError,
}) {
  return (
    <LiveKitRoom
      data-lk-theme="default"
      className="td-call-media"
      serverUrl={connection.url}
      token={connection.token}
      options={options}
      connect
      audio
      video={connection.video}
      onDisconnected={onLeave}
      onError={onError}
    >
      <Stage onLeave={onLeave} />
    </LiveKitRoom>
  );
}