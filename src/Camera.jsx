import { useRef, useState, useEffect } from "react";

function Camera({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [captured, setCaptured] = useState(null);

  useEffect(() => {
    let stopped = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } })
      .then((stream) => {
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => { onCapture(null); onClose(); });
    return () => {
      stopped = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d").drawImage(video, 0, 0);
    setCaptured(canvas.toDataURL("image/jpeg", 0.8));
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  }

  function confirm() { onCapture(captured); onClose(); }
  function retake() { setCaptured(null); setReady(false); }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-2xl p-4 w-full max-w-md shadow-xl">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-gray-800">{captured ? "Preview" : "Take Selfie"}</h3>
          <button onClick={() => { if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); onClose(); }}
            className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        {captured ? (
          <img src={captured} alt="selfie" className="w-full rounded-lg" />
        ) : (
          <video ref={videoRef} onCanPlay={() => { videoRef.current?.play(); setReady(true); }} autoPlay muted playsInline className="w-full rounded-lg bg-black" />
        )}
        <div className="flex justify-center gap-3 mt-4">
          {captured ? (
            <>
              <button onClick={retake} className="px-5 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition">Retake</button>
              <button onClick={confirm} className="px-5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition">Use Photo</button>
            </>
          ) : (
            <>
              <button 
                onClick={() => { if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); onClose(); }}
                className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 font-semibold transition"
              >
                Cancel
              </button>
              <button 
                onClick={capture} 
                disabled={!ready} 
                className={`px-6 py-2.5 rounded-lg text-white font-semibold transition ${ready ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-300 cursor-not-allowed"}`}
              >
                📸 Capture
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Camera;
