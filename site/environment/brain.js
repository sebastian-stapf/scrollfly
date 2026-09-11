/* Anatomical skeleton viewer. Every line is a sampled real MaleCNS SWC segment. */
(function (root) {
  'use strict';
  const palette = ['#59d9e8', '#faaf51', '#b29dff', '#f177c5', '#a9de65', '#66aaff'];
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  class BrainView {
    constructor(canvas) {
      this.canvas = canvas; this.context = canvas.getContext('2d');
      this.yaw = -.2; this.pitch = .06; this.zoom = 1; this.actionIndex = -1;
      this.geometry = null; this.telemetry = null; this.dragging = false;
      canvas.addEventListener('pointerdown', e => { this.dragging = true; this.x = e.clientX; this.y = e.clientY; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove', e => {
        if (!this.dragging) return;
        this.yaw += (e.clientX-this.x)*.008; this.pitch = clamp(this.pitch+(e.clientY-this.y)*.005,-1.4,1.4);
        this.x=e.clientX; this.y=e.clientY; this.draw();
      });
      for (const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name,()=>{this.dragging=false;});
      canvas.addEventListener('wheel',e=>{ e.preventDefault();this.zoom=clamp(this.zoom*Math.exp(-e.deltaY*.001),.6,2.5);this.draw();},{passive:false});
      new ResizeObserver(()=>this.draw()).observe(canvas);
    }
    setGeometry(geometry) { this.geometry=geometry; this.draw(); }
    setTelemetry(telemetry) { this.telemetry=telemetry; this.draw(); }
    selectAction(index) { this.actionIndex=index; this.draw(); }
    draw() {
      const canvas=this.canvas,c=this.context, box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
      const w=box.width,h=box.height;if(!w||!h)return;
      if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
      c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
      if(!this.geometry)return;
      const cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),cp=Math.cos(this.pitch),sp=Math.sin(this.pitch),scale=Math.min(w*.62,h*.83)*this.zoom;
      const project=p=>{
        const x=p[0]*cy+p[2]*sy,z=-p[0]*sy+p[2]*cy;
        return [w/2+x*scale,h*.49+(p[1]*cp-z*sp)*scale,z*cp+p[1]*sp];
      };
      const t=this.telemetry,activity=t?.activity||{},contribution=t?.contributions?.[this.actionIndex]||{};
      const chosen=this.actionIndex>=0;
      const contributionScale=chosen?Math.max(1e-12,...Object.values(contribution).map(Math.abs)):1;
      const neurons=this.geometry.neurons;
      c.globalCompositeOperation='screen';
      for(const n of neurons){
        const a=Number(activity[n.id]||0),v=Number(contribution[n.id]||0);
        const intensity=chosen?Math.min(Math.abs(v)/contributionScale,1):Math.min(a,1);
        const color=chosen?(v<0?'#ff9589':'#d5ff7b'):palette[n.group%palette.length];
        c.strokeStyle=color;c.lineWidth=intensity>.3?1.2:.65;c.globalAlpha=chosen?.045+intensity*.88:.13+intensity*.75;
        c.beginPath();
        for(const s of n.segments){const a=project(s[0]),b=project(s[1]);c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);}
        c.stroke();
        if(intensity>.16&&n.soma){const p=project(n.soma);c.fillStyle=color;c.globalAlpha=.2+intensity*.7;c.beginPath();c.arc(p[0],p[1],1.5+intensity*2.5,0,Math.PI*2);c.fill();}
      }
      c.globalCompositeOperation='source-over';c.globalAlpha=1;
    }
  }
  class BrainClient {
    constructor(base='http://127.0.0.1:8877') { this.base=base;this.connected=false;this.pending=false;this.last=null; }
    async get(path) { const r=await fetch(this.base+path,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`Brain service: ${r.status}`);return r.json(); }
    async connect() {const data=await this.get('/metadata');this.connected=true;return data;}
    async infer(observation,config){
      if(this.pending)throw Error('Inference already pending');
      this.pending=true;
      try {
        const v=observation.vision;
        const encode=a=>{let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(s);};
        const vision={width:v.width,height:v.height,channels:3};
        for(const k of ['mono','left','right'])if(v[k])vision[k]=encode(v[k]);
        const payload={environment_version:FlyLab.ENV_VERSION,observation:{vision,...(observation.smell?{smell:observation.smell}:{})},dimension:config.dimension,control:config.control,sensors:config.sensors};
        const response=await fetch(this.base+'/infer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
        const result=await response.json();if(!response.ok)throw Error(result.error||'Inference failed');
        this.last=result;return result;
      }finally{this.pending=false;}
    }
  }
  root.FlyBrain={BrainView,BrainClient};
})(globalThis);
