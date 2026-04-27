// MediaPipe Pose HTML — runs in a WebView, computes joint angles, counts reps,
// posts {type:'rep', count, angle, status} messages back to React Native.
// Mirrors the body_part_angle algorithm from the user's reference Python repo.

export const POSE_TRACKER_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>HealthMate Pose</title>
<style>
  html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden;font-family:-apple-system,Segoe UI,sans-serif;color:#fff;}
  #wrap{position:relative;width:100%;height:100%;}
  video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);}
  canvas{position:absolute;inset:0;width:100%;height:100%;transform:scaleX(-1);}
  #status{position:absolute;top:10px;left:10px;right:10px;display:flex;justify-content:space-between;align-items:center;z-index:5;pointer-events:none;}
  .pill{background:rgba(0,0,0,0.55);padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:1px;}
  #count{font-size:18px;color:#fff;background:#2A5C43;}
  #angle{color:#CFE2D5;}
  #stage{color:#fff;background:#C25E46;}
  #msg{position:absolute;bottom:14px;left:14px;right:14px;text-align:center;font-size:12px;color:#fff;background:rgba(0,0,0,0.55);padding:8px;border-radius:8px;z-index:5;}
  #err{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;padding:20px;text-align:center;font-size:13px;}
</style>
</head>
<body>
<div id="wrap">
  <video id="video" autoplay playsinline muted></video>
  <canvas id="canvas"></canvas>
  <div id="status">
    <div id="count" class="pill">REPS 0</div>
    <div id="stage" class="pill">—</div>
    <div id="angle" class="pill">— °</div>
  </div>
  <div id="msg">Loading AI Pose model…</div>
</div>

<script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js" crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3/drawing_utils.js" crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/pose.js" crossorigin="anonymous"></script>
<script>
(function(){
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
  let exerciseId = params.get('exercise') || 'push-up';

  const videoEl = document.getElementById('video');
  const canvasEl = document.getElementById('canvas');
  const ctx = canvasEl.getContext('2d');
  const countEl = document.getElementById('count');
  const stageEl = document.getElementById('stage');
  const angleEl = document.getElementById('angle');
  const msgEl = document.getElementById('msg');

  let counter = 0;
  let stage = 'up';
  let lastRepAt = 0;

  function send(type, payload){
    try {
      const data = JSON.stringify(Object.assign({type}, payload));
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(data);
      }
    } catch(e){ /* noop */ }
  }

  // ===== Angle helpers (mirror reference body_part_angle.py) =====
  function angle3(a, b, c){
    if(!a||!b||!c) return null;
    const ab = {x:a.x-b.x,y:a.y-b.y};
    const cb = {x:c.x-b.x,y:c.y-b.y};
    const dot = ab.x*cb.x + ab.y*cb.y;
    const magab = Math.hypot(ab.x,ab.y);
    const magcb = Math.hypot(cb.x,cb.y);
    if(magab===0||magcb===0) return null;
    let cos = dot/(magab*magcb);
    cos = Math.max(-1, Math.min(1, cos));
    return Math.acos(cos) * 180 / Math.PI;
  }
  function avg(p1,p2){ return p1&&p2 ? {x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2,visibility:Math.min(p1.visibility||1,p2.visibility||1)} : null; }
  // MediaPipe Pose landmark indices
  const LM = {NOSE:0, L_SHOULDER:11, R_SHOULDER:12, L_ELBOW:13, R_ELBOW:14, L_WRIST:15, R_WRIST:16, L_HIP:23, R_HIP:24, L_KNEE:25, R_KNEE:26, L_ANKLE:27, R_ANKLE:28};
  function leftArm(lm){ return angle3(lm[LM.L_SHOULDER], lm[LM.L_ELBOW], lm[LM.L_WRIST]); }
  function rightArm(lm){ return angle3(lm[LM.R_SHOULDER], lm[LM.R_ELBOW], lm[LM.R_WRIST]); }
  function leftLeg(lm){ return angle3(lm[LM.L_HIP], lm[LM.L_KNEE], lm[LM.L_ANKLE]); }
  function rightLeg(lm){ return angle3(lm[LM.R_HIP], lm[LM.R_KNEE], lm[LM.R_ANKLE]); }
  function abdomen(lm){
    const sh = avg(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]);
    const hp = avg(lm[LM.L_HIP], lm[LM.R_HIP]);
    const kn = avg(lm[LM.L_KNEE], lm[LM.R_KNEE]);
    return angle3(sh, hp, kn);
  }
  function avgArm(lm){ const l=leftArm(lm), r=rightArm(lm); if(l==null&&r==null)return null; if(l==null)return r; if(r==null)return l; return (l+r)/2; }
  function avgLeg(lm){ const l=leftLeg(lm), r=rightLeg(lm); if(l==null&&r==null)return null; if(l==null)return r; if(r==null)return l; return (l+r)/2; }

  // ===== Per-exercise rep state machine =====
  // Each returns {angle, stage_label, counted}
  function track(ex, lm){
    const now = Date.now();
    function bump(newStage){
      if (now - lastRepAt < 500) return false;
      counter += 1;
      lastRepAt = now;
      stage = newStage;
      send('rep', {count: counter, exercise: ex});
      return true;
    }
    let ang = null, label = stage;
    if (ex === 'push-up' || ex === 'pull-up') {
      ang = avgArm(lm);
      if (ang == null) return {angle:null,label};
      // arms straight (high angle) = up, bent (low angle) = down
      if (ang > 160) { label = 'up'; if (stage === 'down') bump('up'); else stage = 'up'; }
      else if (ang < 90) { label = 'down'; stage = 'down'; }
    } else if (ex === 'bicep-curls') {
      ang = avgArm(lm);
      if (ang == null) return {angle:null,label};
      // up = bent (low angle), down = straight (high angle). count on going up after down.
      if (ang > 160) { label = 'down'; stage = 'down'; }
      else if (ang < 50) { label = 'up'; if (stage === 'down') bump('up'); else stage = 'up'; }
    } else if (ex === 'shoulder-press') {
      ang = avgArm(lm);
      if (ang == null) return {angle:null,label};
      // similar to push-up: extended (~170) = up, folded (~90) = down. count on extended.
      if (ang > 165) { label = 'up'; if (stage === 'down') bump('up'); else stage = 'up'; }
      else if (ang < 95) { label = 'down'; stage = 'down'; }
    } else if (ex === 'squat' || ex === 'lunges') {
      ang = avgLeg(lm);
      if (ang == null) return {angle:null,label};
      if (ang > 160) { label = 'up'; if (stage === 'down') bump('up'); else stage = 'up'; }
      else if (ang < 110) { label = 'down'; stage = 'down'; }
    } else if (ex === 'sit-up') {
      ang = abdomen(lm);
      if (ang == null) return {angle:null,label};
      // up = sitting up (small angle), down = lying (large angle)
      if (ang > 140) { label = 'down'; stage = 'down'; }
      else if (ang < 80) { label = 'up'; if (stage === 'down') bump('up'); else stage = 'up'; }
    } else if (ex === 'jumping-jacks') {
      // Approximate via wrists going above shoulders
      const ls = lm[LM.L_SHOULDER], rs = lm[LM.R_SHOULDER];
      const lw = lm[LM.L_WRIST], rw = lm[LM.R_WRIST];
      if (!ls||!rs||!lw||!rw) return {angle:null,label};
      const shY = (ls.y + rs.y)/2;
      const wrY = (lw.y + rw.y)/2;
      // y is normalized 0..1 (top=0). wrists ABOVE shoulders => wrY < shY
      const diff = shY - wrY; // positive when wrists above shoulders
      ang = Math.round(diff*1000)/10;
      if (diff > 0.05) { label = 'up'; if (stage === 'down') bump('up'); else stage = 'up'; }
      else if (diff < -0.05) { label = 'down'; stage = 'down'; }
    } else if (ex === 'burpees') {
      // Use abdomen angle: standing (170+) -> down (90-) -> standing again
      ang = abdomen(lm);
      if (ang == null) return {angle:null,label};
      if (ang > 160) { label = 'up'; if (stage === 'down') bump('up'); else stage = 'up'; }
      else if (ang < 100) { label = 'down'; stage = 'down'; }
    } else if (ex === 'deadlift') {
      ang = abdomen(lm);
      if (ang == null) return {angle:null,label};
      if (ang > 165) { label = 'up'; if (stage === 'down') bump('up'); else stage = 'up'; }
      else if (ang < 110) { label = 'down'; stage = 'down'; }
    } else {
      // plank or unknown -> just report angle
      ang = abdomen(lm);
    }
    return {angle: ang, label};
  }

  function onResults(results) {
    msgEl.style.display = 'none';
    canvasEl.width = videoEl.videoWidth || 640;
    canvasEl.height = videoEl.videoHeight || 480;
    ctx.save();
    ctx.clearRect(0,0,canvasEl.width,canvasEl.height);
    if (results.poseLandmarks) {
      try {
        if (window.drawConnectors && window.POSE_CONNECTIONS) {
          window.drawConnectors(ctx, results.poseLandmarks, window.POSE_CONNECTIONS, {color:'#2A5C43', lineWidth:3});
        }
        if (window.drawLandmarks) {
          window.drawLandmarks(ctx, results.poseLandmarks, {color:'#C25E46', lineWidth:1, radius:3});
        }
      } catch(e){}
      // scale landmarks to canvas
      const lm = results.poseLandmarks.map(p => ({x:p.x*canvasEl.width, y:p.y*canvasEl.height, visibility:p.visibility}));
      const r = track(exerciseId, lm);
      countEl.textContent = 'REPS ' + counter;
      stageEl.textContent = (r.label || stage || '—').toUpperCase();
      angleEl.textContent = r.angle != null ? Math.round(r.angle) + '°' : '— °';
    } else {
      stageEl.textContent = 'NO POSE';
      angleEl.textContent = '— °';
    }
    ctx.restore();
  }

  function showError(msg){
    document.getElementById('wrap').innerHTML = '<div id="err">'+msg+'</div>';
    send('error', {message: msg});
  }

  async function start(){
    try {
      if (typeof Pose === 'undefined') {
        return showError('Failed to load MediaPipe Pose. Check your internet connection.');
      }
      const pose = new Pose({locateFile: (file) => 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/' + file});
      pose.setOptions({modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5});
      pose.onResults(onResults);
      send('ready', {});
      const camera = new Camera(videoEl, {
        onFrame: async () => {
          try { await pose.send({image: videoEl}); } catch(e){}
        },
        width: 640,
        height: 480,
        facingMode: 'user'
      });
      await camera.start();
    } catch(err) {
      showError('Camera access failed: ' + (err && err.message ? err.message : err));
    }
  }

  // expose change-exercise API
  window.healthmate = {
    setExercise: function(id){ exerciseId = id; counter = 0; stage = 'up'; countEl.textContent='REPS 0'; },
    reset: function(){ counter = 0; stage = 'up'; countEl.textContent='REPS 0'; }
  };

  // Receive messages from RN via injectedJavaScript or postMessage
  document.addEventListener('message', function(e){
    try {
      const data = JSON.parse(e.data);
      if (data.action === 'setExercise') window.healthmate.setExercise(data.exercise);
      else if (data.action === 'reset') window.healthmate.reset();
    } catch(_){}
  });

  start();
})();
</script>
</body>
</html>`;
