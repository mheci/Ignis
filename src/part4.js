  /* ============================================================
     Ignis Render — UI (download dialog, dashboard, viewer)
     ============================================================ */

  const INTERNAL_CSS = `
:root{
  --ig-brand:#f43f5e;
  --ig-brand-2:#fb923c;
  --ig-accent:#f97316;
  --ig-accent-soft:rgba(249,115,22,.12);
  --ig-surface:#ffffff;
  --ig-surface-2:#f6f6f8;
  --ig-surface-3:#ececf1;
  --ig-text:#17171a;
  --ig-text-2:#71717a;
  --ig-line:rgba(24,24,27,.09);
  --ig-line-strong:rgba(24,24,27,.16);
  --ig-shadow:0 24px 60px -20px rgba(24,24,27,.35),0 2px 8px rgba(24,24,27,.06);
  --ig-shadow-sm:0 8px 24px -12px rgba(24,24,27,.3);
  --ig-radius:18px;
  --ig-radius-sm:12px;
  --ig-overlay:rgba(16,16,20,.55);
  --ig-ring:0 0 0 3px rgba(249,115,22,.28);
  --ig-font:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
  --ig-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){
  :root{
    --ig-surface:#17171b;
    --ig-surface-2:#1f1f25;
    --ig-surface-3:#2a2a32;
    --ig-text:#f4f4f5;
    --ig-text-2:#a1a1aa;
    --ig-line:rgba(255,255,255,.08);
    --ig-line-strong:rgba(255,255,255,.16);
    --ig-shadow:0 24px 60px -20px rgba(0,0,0,.8),0 2px 8px rgba(0,0,0,.35);
    --ig-shadow-sm:0 8px 24px -12px rgba(0,0,0,.7);
    --ig-overlay:rgba(0,0,0,.68);
    --ig-accent-soft:rgba(249,115,22,.16);
  }
}
.ignis-toasts{position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;gap:10px;align-items:center;pointer-events:none;max-width:min(92vw,520px)}
.ignis-toast{pointer-events:auto;display:flex;align-items:center;gap:10px;background:var(--ig-surface);color:var(--ig-text);border:1px solid var(--ig-line);border-radius:14px;padding:12px 18px;font:500 13px/1.45 var(--ig-font);box-shadow:var(--ig-shadow-sm);opacity:0;transform:translateY(-12px) scale(.97);transition:opacity .22s ease,transform .22s ease;cursor:pointer;max-width:100%}
.ignis-toast::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--ig-accent);flex-shrink:0}
.ignis-toast-in{opacity:1;transform:none}
.ignis-toast-out{opacity:0;transform:translateY(-8px)}
.ignis-toast-success::before{background:#22c55e}
.ignis-toast-error::before{background:#ef4444}
.ignis-toast-info::before{background:var(--ig-accent)}

.ignis-progress{position:fixed;bottom:24px;right:24px;z-index:2147483000;display:none;align-items:center;gap:12px;background:var(--ig-surface);color:var(--ig-text);border:1px solid var(--ig-line);border-radius:14px;padding:12px 18px;font:600 12px var(--ig-font);box-shadow:var(--ig-shadow-sm)}
.ignis-progress-on{display:flex}
.ignis-progress i{width:16px;height:16px;border-radius:50%;border:2px solid var(--ig-brand);border-top-color:transparent;animation:ignisSpin .7s linear infinite}
@keyframes ignisSpin{to{transform:rotate(360deg)}}

.ignis-modal{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;background:transparent;opacity:0;transition:opacity .2s ease;padding:24px}
.ignis-modal-in{opacity:1;background:var(--ig-overlay);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.ignis-modal-card{position:relative;width:min(760px,100%);max-height:88vh;display:flex;flex-direction:column;background:var(--ig-surface);color:var(--ig-text);border:1px solid var(--ig-line);border-radius:var(--ig-radius);box-shadow:var(--ig-shadow);overflow:hidden;transform:translateY(14px) scale(.985);transition:transform .2s cubic-bezier(.2,.8,.2,1);font-family:var(--ig-font)}
.ignis-modal-in .ignis-modal-card{transform:none}
.ignis-modal-wide .ignis-modal-card{width:min(980px,100%)}
.ignis-modal-head{display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid var(--ig-line);flex-shrink:0}
.ignis-modal-title{font-size:16px;font-weight:700;letter-spacing:-.01em;display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.ignis-modal-title .ignis-sub{font:600 11px var(--ig-font);color:var(--ig-text-2);background:var(--ig-surface-2);border:1px solid var(--ig-line);padding:3px 9px;border-radius:999px;white-space:nowrap;letter-spacing:0}
.ignis-modal-x{width:34px;height:34px;border:none;background:transparent;color:var(--ig-text-2);border-radius:10px;display:grid;place-items:center;cursor:pointer;transition:background .15s,color .15s;flex-shrink:0}
.ignis-modal-x:hover{background:var(--ig-surface-2);color:var(--ig-text)}
.ignis-modal-body{flex:1;overflow-y:auto;padding:16px;scrollbar-width:thin;scrollbar-color:var(--ig-line-strong) transparent}
.ignis-modal-body::-webkit-scrollbar{width:10px}
.ignis-modal-body::-webkit-scrollbar-thumb{background:var(--ig-line-strong);border-radius:99px;border:3px solid var(--ig-surface)}
.ignis-modal-foot{display:flex;align-items:center;gap:10px;padding:14px 18px;border-top:1px solid var(--ig-line);flex-shrink:0;flex-wrap:nowrap;justify-content:flex-end;background:var(--ig-surface)}
.ignis-foot-gap{flex:1}

.ignis-btn{border:none;border-radius:11px;padding:10px 18px;font:600 13px var(--ig-font);cursor:pointer;transition:transform .1s,filter .15s,background .15s;display:inline-flex;align-items:center;gap:8px;min-height:40px}
.ignis-btn:active{transform:scale(.98)}
.ignis-btn:focus-visible{outline:none;box-shadow:var(--ig-ring)}
.ignis-btn:disabled{opacity:.4;cursor:not-allowed}
.ignis-btn-pri{background:linear-gradient(135deg,var(--ig-brand),var(--ig-brand-2));color:#fff;box-shadow:0 8px 18px -8px rgba(244,63,94,.65)}
.ignis-btn-pri:not(:disabled):hover{filter:brightness(1.06)}
.ignis-btn-sec{background:var(--ig-surface-2);color:var(--ig-text);border:1px solid var(--ig-line)}
.ignis-btn-sec:not(:disabled):hover{background:var(--ig-surface-3)}
.ignis-btn svg{width:15px;height:15px}
.ignis-btn-sec svg{width:14px;height:14px}

.ignis-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
@media (max-width:520px){.ignis-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}}
.ignis-item{position:relative;display:flex;flex-direction:column;border:1px solid var(--ig-line);border-radius:16px;overflow:hidden;background:var(--ig-surface);transition:border-color .15s,transform .15s,box-shadow .15s}
.ignis-item:hover{border-color:var(--ig-line-strong);transform:translateY(-2px);box-shadow:var(--ig-shadow-sm)}
.ignis-item.is-selected{border-color:var(--ig-accent);box-shadow:0 0 0 1px var(--ig-accent)}
.ignis-card-media{position:relative;aspect-ratio:4/5;background:var(--ig-surface-2);overflow:hidden}
.ignis-thumb{width:100%;height:100%;object-fit:cover;display:block}
.ignis-thumb-empty{width:100%;height:100%;display:grid;place-items:center;color:var(--ig-text-2);background:repeating-linear-gradient(135deg,var(--ig-surface-2),var(--ig-surface-2) 10px,var(--ig-surface-3) 10px,var(--ig-surface-3) 20px)}
.ignis-badge{position:absolute;top:10px;right:10px;font:700 9px var(--ig-font);letter-spacing:.08em;padding:4px 8px;border-radius:999px;background:rgba(12,12,16,.7);color:#fff;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.ignis-checkmark{position:absolute;top:10px;left:10px;width:22px;height:22px;border-radius:7px;border:2px solid rgba(255,255,255,.9);background:rgba(12,12,16,.35);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:grid;place-items:center;transition:background .15s,border-color .15s}
.ignis-checkmark::after{content:"";width:10px;height:6px;border-left:2px solid #fff;border-bottom:2px solid #fff;transform:rotate(-45deg) scale(0);transition:transform .12s;margin-top:-2px}
.ignis-checkmark:focus-visible{outline:2px solid #fff;outline-offset:2px}
.ignis-item.is-selected .ignis-checkmark{background:var(--ig-accent);border-color:var(--ig-accent)}
.ignis-item.is-selected .ignis-checkmark::after{transform:rotate(-45deg) scale(1)}
.ignis-card-body{padding:10px 12px 4px}
.ignis-type{font:600 10px var(--ig-font);color:var(--ig-text-2);letter-spacing:.06em;text-transform:uppercase;display:flex;gap:6px;align-items:center}
.ignis-type b{color:var(--ig-text);font-size:10px}
.ignis-cap{font:400 11px/1.45 var(--ig-font);color:var(--ig-text-2);margin-top:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.ignis-actions{display:flex;gap:4px;padding:6px 8px 10px;margin-top:auto}
.ignis-act{width:32px;height:32px;border:none;border-radius:9px;background:var(--ig-surface-2);color:var(--ig-text-2);display:grid;place-items:center;cursor:pointer;transition:all .12s}
.ignis-act:hover{background:var(--ig-accent);color:#fff}
.ignis-act svg{width:15px;height:15px}
.ignis-item input[type="checkbox"]{position:absolute;opacity:0;pointer-events:none}

.ignis-sel{display:flex;align-items:center;gap:9px;cursor:pointer;user-select:none;font:600 12px var(--ig-font);color:var(--ig-text);white-space:nowrap}
.ignis-sel input{position:absolute;opacity:0;width:0;height:0}
.ignis-sel span{width:18px;height:18px;border:1.5px solid var(--ig-line-strong);border-radius:6px;display:grid;place-items:center;transition:all .15s;background:var(--ig-surface);flex-shrink:0}
.ignis-sel span::after{content:"";width:9px;height:5px;border-left:2px solid #fff;border-bottom:2px solid #fff;transform:rotate(-45deg) scale(0);transition:transform .12s;margin-top:-1px}
.ignis-sel input:checked~span{background:var(--ig-accent);border-color:var(--ig-accent)}
.ignis-sel input:checked~span::after{transform:rotate(-45deg) scale(1)}
.ignis-sel input:indeterminate~span{background:var(--ig-accent);border-color:var(--ig-accent)}
.ignis-sel input:indeterminate~span::after{transform:none;border:none;width:8px;height:2px;background:#fff;margin:0}
.ignis-count{font:700 10px var(--ig-mono);background:var(--ig-surface-2);border:1px solid var(--ig-line);border-radius:999px;padding:2px 8px;color:var(--ig-text-2)}
.ignis-empty{padding:48px 20px;text-align:center;color:var(--ig-text-2);font:500 13px var(--ig-font)}
.ignis-load{display:flex;align-items:center;justify-content:center;gap:12px;padding:56px 0;color:var(--ig-text-2);font:500 13px var(--ig-font)}
.ignis-load i{width:18px;height:18px;border-radius:50%;border:2px solid var(--ig-line);border-top-color:var(--ig-accent);animation:ignisSpin .7s linear infinite}
.ignis-hint{font-size:11px;color:var(--ig-text-2)}

.ignis-tabs{display:flex;gap:4px;padding:4px;background:var(--ig-surface-2);border:1px solid var(--ig-line);border-radius:12px;margin:0 0 12px;overflow-x:auto;flex-shrink:0;scrollbar-width:none}
.ignis-tabs::-webkit-scrollbar{display:none}
.ignis-tab{border:none;background:transparent;color:var(--ig-text-2);font:600 12px var(--ig-font);padding:8px 14px;border-radius:9px;cursor:pointer;white-space:nowrap;transition:all .15s}
.ignis-tab:hover{color:var(--ig-text)}
.ignis-tab-a{color:var(--ig-text)!important;background:var(--ig-surface);box-shadow:0 1px 4px rgba(0,0,0,.08)}
.ignis-tab b{font-size:9px;background:var(--ig-accent);color:#fff;border-radius:999px;padding:1px 6px;margin-left:6px;vertical-align:1px}
.ignis-search{margin:0 0 12px;padding:10px 14px;border:1px solid var(--ig-line);border-radius:11px;background:var(--ig-surface-2);color:var(--ig-text);font:500 13px var(--ig-font);outline:none;width:100%;box-sizing:border-box}
.ignis-search:focus{border-color:var(--ig-accent);box-shadow:var(--ig-ring)}
.ignis-search::placeholder{color:var(--ig-text-2)}

.ignis-row{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:12px;transition:background .1s;border:1px solid transparent}
.ignis-row:hover{background:var(--ig-surface-2)}
.ignis-row-txt{flex:1;min-width:0}
.ignis-row-lb{font:600 13px var(--ig-font);color:var(--ig-text);letter-spacing:-.01em}
.ignis-row-ds{font:400 11px/1.5 var(--ig-font);color:var(--ig-text-2);margin-top:2px}
.ignis-row-dis .ignis-row-lb,.ignis-row-dis .ignis-row-ds{opacity:.45}
.ignis-sw{position:relative;width:42px;height:24px;flex-shrink:0;cursor:pointer}
.ignis-sw input{position:absolute;opacity:0;width:0;height:0}
.ignis-sw i{position:absolute;inset:0;background:var(--ig-surface-3);border-radius:999px;transition:background .22s}
.ignis-sw i::before{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;background:#fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.25);transition:left .22s}
.ignis-sw input:checked~i{background:var(--ig-accent)}
.ignis-sw input:checked~i::before{left:20px}
.ignis-sw input:focus-visible~i{box-shadow:var(--ig-ring)}
.ignis-sw input:disabled~i{opacity:.5;cursor:not-allowed}
.ignis-row-edit{position:absolute;inset:0;z-index:5;display:flex;align-items:center;gap:8px;background:var(--ig-surface);border:1px solid var(--ig-accent);border-radius:12px;padding:0 12px;box-shadow:var(--ig-shadow)}
.ignis-row-wrap{position:relative}
.ignis-inp{flex:1;min-width:60px;padding:8px 12px;border:1px solid var(--ig-line);border-radius:9px;background:var(--ig-surface-2);color:var(--ig-text);font:500 12px var(--ig-mono);outline:none}
.ignis-inp:focus{border-color:var(--ig-accent);box-shadow:var(--ig-ring)}

.ignis-kbd{display:inline-flex;align-items:center;gap:4px;font:600 11px var(--ig-mono);color:var(--ig-text-2)}
.ignis-kbd kbd{background:var(--ig-surface-2);border:1px solid var(--ig-line);border-bottom-width:2px;border-radius:6px;padding:2px 7px;font:600 11px var(--ig-mono)}
.ignis-keyrow{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;cursor:pointer;transition:background .1s}
.ignis-keyrow:hover{background:var(--ig-surface-2)}
.ignis-keyrow .ignis-kbd{flex:1}
.ignis-keyrow button{border:1px dashed var(--ig-line-strong);background:transparent;color:var(--ig-text-2);border-radius:8px;padding:6px 12px;font:600 11px var(--ig-mono);cursor:pointer;transition:all .15s}
.ignis-keyrow button:hover{border-color:var(--ig-accent);color:var(--ig-accent)}

.ignis-about{padding:8px 4px;line-height:1.75;font-size:13px;color:var(--ig-text)}
.ignis-about b{color:var(--ig-brand)}
.ignis-about a{color:var(--ig-accent);text-decoration:none;font-weight:600}
.ignis-about a:hover{text-decoration:underline}
.ignis-rt{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}
.ignis-rt span{background:var(--ig-surface-2);border:1px solid var(--ig-line);border-radius:999px;padding:4px 11px;font:600 10px var(--ig-font);color:var(--ig-text-2);letter-spacing:.03em;text-transform:uppercase}
.ignis-hero{display:flex;align-items:center;gap:14px;padding:8px 4px 18px;border-bottom:1px solid var(--ig-line);margin-bottom:8px}
.ignis-hero-mark{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,var(--ig-brand),var(--ig-brand-2));display:grid;place-items:center;color:#fff;font:800 18px var(--ig-font);box-shadow:0 10px 24px -10px rgba(244,63,94,.7)}
.ignis-hero-mark svg{width:22px;height:22px}
.ignis-hero h3{margin:0;font-size:17px;letter-spacing:-.02em}
.ignis-hero p{margin:2px 0 0;font-size:12px;color:var(--ig-text-2)}

.ignis-stat-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
.ignis-stat-card{background:var(--ig-surface-2);border:1px solid var(--ig-line);border-radius:14px;padding:14px}
.ignis-stat-card .ignis-stat-v{font:700 22px/1.1 var(--ig-font);letter-spacing:-.03em;display:block;margin-top:6px}
.ignis-stat-card small{display:block;font:600 10px var(--ig-font);color:var(--ig-text-2);letter-spacing:.06em;text-transform:uppercase}
.ignis-stats-h{font:700 10px var(--ig-font);color:var(--ig-text-2);letter-spacing:.08em;text-transform:uppercase;padding:16px 4px 6px}
.ignis-row .ignis-stat-v{font:600 12px var(--ig-mono);color:var(--ig-text);flex-shrink:0}
.ignis-spark{display:flex;align-items:flex-end;gap:4px;height:72px;padding:8px 4px;border-bottom:1px solid var(--ig-line);margin-bottom:6px}
.ignis-spark-bar{flex:1;min-width:4px;background:linear-gradient(180deg,var(--ig-brand),var(--ig-brand-2));border-radius:3px 3px 0 0;opacity:.85;transition:opacity .15s}
.ignis-spark-bar:hover{opacity:1}

.ignis-tagged-list{display:flex;flex-direction:column;gap:6px}
.ignis-tagged{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid var(--ig-line);border-radius:12px;background:var(--ig-surface-2);color:var(--ig-text);font:600 13px var(--ig-font);text-decoration:none;transition:all .15s}
.ignis-tagged:hover{border-color:var(--ig-accent);background:var(--ig-surface-3);color:var(--ig-accent)}
.ignis-tagged svg{width:14px;height:14px;opacity:.6}
.ignis-tagged:hover svg{opacity:1}

.ignis-palette{position:fixed;inset:0;z-index:2147482600;background:var(--ig-overlay);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:flex-start;justify-content:center;padding-top:12vh}
.ignis-pal-card{width:min(560px,92vw);background:var(--ig-surface);color:var(--ig-text);border-radius:16px;border:1px solid var(--ig-line);box-shadow:var(--ig-shadow);overflow:hidden;animation:ignisPal .18s ease}
@keyframes ignisPal{from{opacity:0;transform:translateY(-8px) scale(.99)}to{opacity:1;transform:none}}
.ignis-pal-inp{width:100%;box-sizing:border-box;border:none;outline:none;background:transparent;color:var(--ig-text);padding:17px 20px;font:500 14px var(--ig-font);border-bottom:1px solid var(--ig-line)}
.ignis-pal-inp::placeholder{color:var(--ig-text-2)}
.ignis-pal-list{max-height:48vh;overflow-y:auto;padding:8px;scrollbar-width:thin}
.ignis-pal-it{padding:10px 12px;border-radius:10px;font:500 13px var(--ig-font);cursor:pointer;display:flex;justify-content:space-between;gap:12px;align-items:center}
.ignis-pal-it small{font:600 10px var(--ig-mono);color:var(--ig-text-2)}
.ignis-pal-on{background:var(--ig-accent-soft);color:var(--ig-accent)}

.ignis-bar{position:absolute;top:12px;right:12px;z-index:15;display:flex;flex-direction:row-reverse;gap:6px;padding:6px;border-radius:14px;background:rgba(16,16,20,.62);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 24px -8px rgba(0,0,0,.5)}
.ignis-dl,.ignis-nt,.ignis-th,.ignis-da{width:36px;height:36px;border:none;border-radius:10px;background:transparent;color:#fff;display:grid;place-items:center;cursor:pointer;transition:all .12s}
.ignis-dl:hover,.ignis-nt:hover,.ignis-th:hover,.ignis-da:hover{background:rgba(255,255,255,.16);transform:scale(1.06)}
.ignis-dl:active,.ignis-nt:active,.ignis-th:active,.ignis-da:active{transform:scale(.94)}
.ignis-dl:focus-visible,.ignis-nt:focus-visible,.ignis-th:focus-visible,.ignis-da:focus-visible{outline:2px solid #fff;outline-offset:1px}
.ignis-dl svg,.ignis-nt svg,.ignis-th svg,.ignis-da svg{width:17px;height:17px}

.ignis-storytools{position:absolute;top:16px;right:16px;z-index:14;display:flex;flex-direction:column;gap:6px;padding:6px;border-radius:16px;background:rgba(16,16,20,.55);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 24px -8px rgba(0,0,0,.5)}
.ignis-sd,.ignis-sn,.ignis-sa,.ignis-st,.ignis-tp,.ignis-sl,.ignis-hd,.ignis-hn,.ignis-ha,.ignis-ht,.ignis-htp,.ignis-hl{width:36px;height:36px;border:none;border-radius:10px;background:transparent;color:#fff;display:grid;place-items:center;cursor:pointer;transition:all .12s}
.ignis-sd:hover,.ignis-sn:hover,.ignis-sa:hover,.ignis-st:hover,.ignis-tp:hover,.ignis-sl:hover,.ignis-hd:hover,.ignis-hn:hover,.ignis-ha:hover,.ignis-ht:hover,.ignis-htp:hover,.ignis-hl:hover{background:rgba(255,255,255,.18);transform:scale(1.06)}
.ignis-sd svg,.ignis-sn svg,.ignis-sa svg,.ignis-st svg,.ignis-tp svg,.ignis-sl svg,.ignis-hd svg,.ignis-hn svg,.ignis-ha svg,.ignis-ht svg,.ignis-htp svg,.ignis-hl svg{width:17px;height:17px}
.ignis-sb-pos{position:relative;z-index:12;min-width:28px;height:20px;padding:0 7px;border-radius:999px;background:rgba(16,16,20,.72);color:#fff;font:700 10px var(--ig-font);display:flex;align-items:center;justify-content:center;pointer-events:none;letter-spacing:.04em;border:1px solid rgba(255,255,255,.14);margin-top:1px}

.ignis-rd{position:absolute;z-index:12;width:36px;height:36px;border:none;border-radius:11px;background:rgba(16,16,20,.55);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.16);color:#fff;display:grid;place-items:center;cursor:pointer;transition:all .12s;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.ignis-rd:hover{background:rgba(255,255,255,.18);transform:scale(1.05)}
.ignis-rd svg{width:17px;height:17px}
.ignis-rn{position:absolute;z-index:12;width:36px;height:36px;border:none;border-radius:11px;background:rgba(16,16,20,.55);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.16);color:#fff;display:grid;place-items:center;cursor:pointer;transition:all .12s;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.ignis-rn:hover{background:rgba(255,255,255,.18);transform:scale(1.05)}
.ignis-rn svg{width:17px;height:17px}
.ignis-pd{position:absolute;top:8px;right:8px;z-index:12;width:34px;height:34px;border-radius:11px;border:1px solid rgba(255,255,255,.4);background:rgba(16,16,20,.55);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);transition:all .12s}
.ignis-pd:hover{background:rgba(255,255,255,.18);transform:scale(1.05)}
.ignis-pd svg{width:16px;height:16px}
.ignis-gd{position:absolute;top:8px;right:8px;z-index:10;width:34px;height:34px;border:none;border-radius:11px;background:rgba(16,16,20,.62);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.14);color:#fff;display:grid;place-items:center;cursor:pointer;opacity:0;transition:opacity .15s ease,transform .12s;box-shadow:0 4px 14px rgba(0,0,0,.3)}
a:hover>.ignis-gd,.ignis-gd:focus-visible,.ignis-gd:hover{opacity:1;transform:scale(1.06)}
.ignis-gd svg{width:16px;height:16px}

.ignis-ksh{position:fixed;inset:0;z-index:2147482500;background:var(--ig-overlay);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:24px}
.ignis-ksh-card{background:var(--ig-surface);color:var(--ig-text);border-radius:var(--ig-radius);padding:24px 28px;max-width:min(580px,100%);box-shadow:var(--ig-shadow);font:500 13px/2 var(--ig-font);border:1px solid var(--ig-line)}
.ignis-ksh-card h3{margin:0 0 12px;font-size:16px;letter-spacing:-.01em}
.ignis-ksh-card table{border-collapse:collapse;width:100%}
.ignis-ksh-card td{padding:4px 0;border-bottom:1px solid var(--ig-line)}
.ignis-ksh-card td:last-child{text-align:right;color:var(--ig-text-2)}
.ignis-ksh-card .ignis-hint{margin-top:12px;text-align:center;font-size:11px;color:var(--ig-text-2)}
.ignis-ksh-card kbd{background:var(--ig-surface-2);border:1px solid var(--ig-line);border-bottom-width:2px;border-radius:6px;padding:2px 8px;font:600 10px var(--ig-mono)}

.ignis-rename{display:flex;flex-direction:column;gap:14px}
.ignis-rename-preview{background:var(--ig-surface-2);border:1px solid var(--ig-line);border-radius:12px;padding:12px 14px;font:500 12px var(--ig-mono);color:var(--ig-text);word-break:break-all}
.ignis-rename-preview small{display:block;font:600 9px var(--ig-font);color:var(--ig-text-2);letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px}
.ignis-chips{display:flex;flex-wrap:wrap;gap:6px}
.ignis-chip{border:1px solid var(--ig-line);background:var(--ig-surface-2);color:var(--ig-text-2);border-radius:999px;padding:4px 9px;font:600 10px var(--ig-mono);cursor:pointer;transition:all .12s}
.ignis-chip:hover{border-color:var(--ig-accent);color:var(--ig-accent);background:var(--ig-accent-soft)}
.ignis-divider{height:1px;background:var(--ig-line);margin:4px 0}
@media (max-width:560px){
  .ignis-modal{padding:10px}
  .ignis-modal-card{max-height:94vh;border-radius:16px}
  .ignis-modal-head{padding:14px 16px}
  .ignis-modal-body{padding:12px}
  .ignis-modal-foot{flex-wrap:wrap;justify-content:stretch;gap:8px;padding:12px}
  .ignis-modal-foot .ignis-btn{flex:1 1 auto;justify-content:center}
  .ignis-foot-gap,.ignis-modal-foot .ignis-hint{display:none}
  .ignis-sel{width:100%;order:-1}
  .ignis-card-body{padding:8px 10px 2px}
  .ignis-actions{padding:4px 6px 8px}
  .ignis-row{padding:10px}
}
`;


  GM_addStyle(INTERNAL_CSS);

  // ─── Modal stack ───────────────────────────────────────────────────────
  const ModalStack = {
    modals: [],
    push: function (m) {
      this.modals.push(m);
      return m;
    },
    pop: function () {
      var m = this.modals.pop();
      if (m) m.close();
      return m;
    },
    closeTop: function () {
      if (this.modals.length) this.pop();
    },
  };

  function createModal(opts) {
    opts = opts || {};
    var root = $('<div class="ignis-modal">');
    var card = $('<div class="ignis-modal-card" role="dialog" aria-modal="true">');
    var head = $('<div class="ignis-modal-head">');
    var title = $('<div class="ignis-modal-title">');
    if (opts.title) title.append(esc(opts.title));
    if (opts.sub) title.append('<span class="ignis-sub">' + esc(opts.sub) + "</span>");
    var closeBtn = $(
      '<button class="ignis-modal-x" aria-label="Close" title="Close (Esc / ' +
        esc(getPlatformModifierKey()) +
        '+Q)">' +
        SVG.CLOSE +
        "</button>"
    );
    var body = $('<div class="ignis-modal-body">');
    var foot = $('<div class="ignis-modal-foot">');
    head.append(title, closeBtn);
    card.append(head, body, foot);
    root.append(card);
    $body.append(root);
    var api = {
      el: root,
      body: body,
      foot: foot,
      title: title,
      close: function () {
        root.removeClass("ignis-modal-in");
        setTimeout(function () {
          root.remove();
        }, 220);
        var i = ModalStack.modals.indexOf(api);
        if (i > -1) ModalStack.modals.splice(i, 1);
        $(document).off("keydown.igmodal", onKey);
      },
    };
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (ModalStack.modals[ModalStack.modals.length - 1] !== api) return;
      e.preventDefault();
      api.close();
    }
    $(document).on("keydown.igmodal", onKey);
    closeBtn.on("click", api.close);
    var cardEl = card[0];
    head.css("cursor", "grab");
    head.on("mousedown.igdrag", function (e) {
      if (e.button !== 0) return;
      if ($(e.target).closest("button")[0]) return;
      e.preventDefault();
      var r = cardEl.getBoundingClientRect();
      var sx = e.clientX;
      var sy = e.clientY;
      var ox = r.left;
      var oy = r.top;
      card.css({ transition: "none", position: "fixed", left: ox + "px", top: oy + "px", margin: "0" });
      function onMove(ev) {
        var maxX = Math.max(8, window.innerWidth - r.width - 8);
        var maxY = Math.max(8, window.innerHeight - 48);
        card.css({
          left: Math.min(maxX, Math.max(8, ox + ev.clientX - sx)) + "px",
          top: Math.min(maxY, Math.max(8, oy + ev.clientY - sy)) + "px",
        });
      }
      function onUp() {
        $(document).off("mousemove.igdrag", onMove);
        $(document).off("mouseup.igdrag", onUp);
        card.css("transition", "");
      }
      $(document).on("mousemove.igdrag", onMove);
      $(document).on("mouseup.igdrag", onUp);
    });
    root.on("mousedown", function (e) {
      if (e.target === root[0]) api.close();
    });
    setTimeout(function () {
      root.addClass("ignis-modal-in");
    }, 10);
    return ModalStack.push(api);
  }

  // ─── Post download dialog ──────────────────────────────────────────────
  function buildPostItems(payload, postPath) {
    var res = normalizePostResource(payload.resource);
    res.items.forEach(function (it) {
      if (it.dash) state.GL_mediaDataCache[it.id] = it.dash;
    });
    return {
      items: res.items,
      meta: {
        username: res.username || "NONE",
        shortcode: res.shortcode || postPath,
        sourceType: "post",
        timestamp: res.takenAt || Math.floor(Date.now() / 1000),
        caption: res.caption || null,
      },
      fromDom: false,
    };
  }

  function extractPostFromDom(postPath, ctx) {
    var $post = null;
    if (ctx && ctx.post) {
      $post = $(ctx.post);
    } else if (ctx && ctx.anchor) {
      var a = ctx.anchor;
      var img = a.querySelector("img");
      if (img) {
        var srcset = parseSrcset(img.getAttribute("srcset") || "");
        var url = (srcset.length ? srcset[srcset.length - 1].url : null) || img.getAttribute("src") || "";
        if (url) {
          return {
            items: [
              {
                id: decodeMediaIdFromUrl(url),
                isVideo: false,
                url: url,
                thumb: url,
                width: 0,
                height: 0,
                caption: null,
                dash: null,
                ext: /\.webp(\?|$)/i.test(url) ? "webp" : "jpg",
              },
            ],
            meta: {
              username: "NONE",
              shortcode: postPath,
              sourceType: "post",
              timestamp: Math.floor(Date.now() / 1000),
              caption: null,
            },
            fromDom: true,
          };
        }
      }
      return null;
    } else {
      $post = $('[data-snig="canDownload"]')
        .filter(function () {
          return $(this).find('a[href*="/' + postPath + '/"]').length > 0;
        })
        .first();
    }
    if (!$post || !$post.length) return null;
    if ($post.find("video[src^='blob:']").length) return null;
    var items = [];
    var seen = new Set();
    var username = $post.attr("data-username") || getPostUsername($post) || "NONE";
    $post.find("img[src]").each(function () {
      var r = this.getBoundingClientRect();
      if (r.width < 150 || r.height < 150) return;
      var $img = $(this);
      var srcset = parseSrcset($img.attr("srcset") || "");
      var url = (srcset.length ? srcset[srcset.length - 1].url : null) || $img.attr("src") || "";
      if (!url || seen.has(url)) return;
      seen.add(url);
      items.push({
        id: decodeMediaIdFromUrl(url),
        isVideo: false,
        url: url,
        thumb: url,
        width: Math.round(r.width),
        height: Math.round(r.height),
        caption: null,
        dash: null,
        ext: /\.webp(\?|$)/i.test(url) ? "webp" : "jpg",
      });
    });
    var $v = $post.find("video").first();
    if ($v.length) {
      var vUrl = $v.attr("src") || "";
      if (/^https?:/i.test(vUrl)) {
        items.push({
          id: decodeMediaIdFromUrl(vUrl),
          isVideo: true,
          url: vUrl,
          thumb: null,
          width: 0,
          height: 0,
          caption: null,
          dash: null,
          ext: "mp4",
        });
      }
    }
    if (!items.length) return null;
    var ts = Math.floor(Date.now() / 1000);
    var $t = $post.find("time[datetime]").first();
    if ($t.length) {
      var d = new Date($t.attr("datetime")).getTime() / 1000;
      if (isFinite(d) && d > 0) ts = Math.floor(d);
    }
    return {
      items: items,
      meta: { username: username, shortcode: postPath, sourceType: "post", timestamp: ts, caption: null },
      fromDom: true,
    };
  }

  async function loadPostItems(postPath, ctx) {
    var instant = extractPostFromDom(postPath, ctx);
    if (instant) return instant;
    var payload = await getPostPayload(postPath);
    return buildPostItems(payload, postPath);
  }

  function renderItems(body, items, meta) {
    body.empty();
    if (!items.length) {
      body.append('<div class="ignis-empty">No downloadable media found.</div>');
      return;
    }
    var grid = $('<div class="ignis-grid">');
    items.forEach(function (item, i) {
      item._igSourceIndex = i + 1;
      var row = $('<div class="ignis-item is-selected" data-idx="' + i + '">');
      var input = $('<input type="checkbox" checked tabindex="-1" aria-hidden="true">');
      var media = $('<div class="ignis-card-media">');
      if (item.thumb) {
        media.append('<img class="ignis-thumb" loading="lazy" src="' + esc(item.thumb) + '" alt="">');
      } else {
        media.append('<div class="ignis-thumb-empty">' + SVG.THUMBNAIL + "</div>");
      }
      media.append(
        '<span class="ignis-checkmark" role="checkbox" tabindex="0" aria-checked="true" aria-label="Select item"></span>',
        '<span class="ignis-badge">' + (item.isVideo ? "VIDEO" : "IMAGE") + "</span>"
      );
      var dims = item.width || item.height ? item.width + "×" + item.height + " · " : "";
      var type =
        '<div class="ignis-type"><b>' +
        (item.isVideo ? "Video" : "Image") +
        "</b><span>" +
        esc(dims) +
        esc(item.ext || "") +
        "</span></div>";
      var cap = item.caption
        ? '<div class="ignis-cap">' + esc(item.caption.slice(0, 180)) + "</div>"
        : "";
      var actions = $('<div class="ignis-actions">');
      actions.append(
        '<button class="ignis-act ig-act-dl" title="Download" aria-label="Download">' + SVG.DOWNLOAD + "</button>",
        '<button class="ignis-act ig-act-nt" title="Open in new tab" aria-label="Open in new tab">' + SVG.NEW_TAB + "</button>"
      );
      if (item.thumb && item.isVideo) {
        actions.append(
          '<button class="ignis-act ig-act-th" title="Download thumbnail" aria-label="Download thumbnail">' + SVG.THUMBNAIL + "</button>"
        );
      }
      if (item.caption) {
        actions.append(
          '<button class="ignis-act ig-act-cap" title="Download caption (.txt)" aria-label="Download caption">' + SVG.TEXT + "</button>"
        );
      }
      row.append(input, media, $('<div class="ignis-card-body">').append(type, cap), actions);
      grid.append(row);
    });
    body.append(grid);
    body.off(".igitem").on("click.igitem", ".ignis-item", function (e) {
      if ($(e.target).closest(".ignis-checkmark").length) {
        var cb = $(this).find('input[type="checkbox"]')[0];
        if (cb) {
          cb.checked = !cb.checked;
          $(this).toggleClass("is-selected", cb.checked);
          $(e.target).closest(".ignis-checkmark").attr("aria-checked", cb.checked ? "true" : "false");
          $(cb).trigger("change");
        }
        e.preventDefault();
        return;
      }
      var act = $(e.target).closest(".ignis-act")[0];
      if (!act) return;
      e.stopPropagation();
      var idx = parseInt($(this).attr("data-idx"), 10);
      var item = items[idx];
      if (!item) return;
      var photoMeta = Object.assign({}, meta, {
        sourceType: item.isVideo ? "video" : "photo",
        index: item._igSourceIndex || idx + 1,
      });
      if (act.classList.contains("ig-act-dl")) {
        downloadResource(item, photoMeta, {});
      } else if (act.classList.contains("ig-act-nt")) {
        downloadResource(item, photoMeta, { preview: true });
      } else if (act.classList.contains("ig-act-th") && item.thumb) {
        saveFiles(item.thumb, Object.assign({}, meta, { sourceType: "thumbnail", filetype: "jpg" }));
      } else if (act.classList.contains("ig-act-cap") && item.caption) {
        var capMeta = Object.assign({}, photoMeta, { caption: item.caption, filetype: "txt" });
        triggerDownload(
          new Blob([item.caption], { type: "text/plain;charset=utf-8" }),
          getSaveFileName(item.url, capMeta)
        );
        Stats.record("caption", 0);
      }
    }).on("keydown.igitem", ".ignis-checkmark", function (e) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        $(this).trigger("click");
      }
    });
  }

  function attachSelectionFooter(modal, getItems, getMeta, extra) {
    var selectAll = $(
      '<label class="ignis-sel" title="Select / deselect all"><input type="checkbox" checked><span></span>Select all<b class="ignis-count"></b></label>'
    );
    var countBadge = selectAll.find(".ignis-count");
    var dlSel = $(
      '<button class="ignis-btn ignis-btn-pri" disabled>' + SVG.DOWNLOAD + " Download Selected</button>"
    );
    var dlAll = $(
      '<button class="ignis-btn ignis-btn-sec">' + SVG.DOWNLOAD_ALL + " Download All</button>"
    );

    function refresh() {
      var checks = modal.body.find('.ignis-item input[type="checkbox"]');
      var total = checks.length;
      var selected = checks.filter(":checked").length;
      selectAll.find("input").prop("checked", total > 0 && selected === total);
      selectAll.find("input").prop("indeterminate", selected > 0 && selected < total);
      countBadge.text(total ? selected + "/" + total : "");
      dlSel.prop("disabled", selected === 0);
      modal.body.find(".ignis-item").each(function () {
        var checked = !!$(this).find('input[type="checkbox"]').prop("checked");
        $(this).toggleClass("is-selected", checked);
        $(this).find(".ignis-checkmark").attr("aria-checked", checked ? "true" : "false");
      });
    }

    function selectedItems() {
      var items = getItems();
      var out = [];
      modal.body.find(".ignis-item").each(function () {
        if ($(this).find('input[type="checkbox"]').prop("checked")) {
          var idx = parseInt($(this).attr("data-idx"), 10);
          if (items[idx]) out.push(items[idx]);
        }
      });
      return out;
    }

    selectAll.find("input").on("change", function () {
      modal.body.find('.ignis-item input[type="checkbox"]').prop("checked", this.checked);
      refresh();
    });
    modal.body.off("change.igsel").on("change.igsel", '.ignis-item input[type="checkbox"]', refresh);
    dlSel.on("click", function () {
      var selected = selectedItems();
      if (!selected.length) {
        Toasts.info("Select at least one item to download.");
        return;
      }
      batchDownload(selected, getMeta());
    });
    dlAll.on("click", function () {
      batchDownload(getItems(), getMeta());
    });

    modal.foot.append(selectAll, '<span class="ignis-foot-gap"></span>', dlSel, dlAll);
    if (extra) modal.foot.append(extra);
    refresh();
    return { refresh: refresh, selectedItems: selectedItems };
  }

  async function openPostDialog(postPath, ctx) {
    var modal = createModal({ title: "Download post", sub: postPath });
    modal.body.append('<div class="ignis-load"><i></i>Loading media…</div>');
    var loaded;
    try {
      loaded = await loadPostItems(postPath, ctx);
    } catch (e) {
      modal.body.empty().append(
        '<div class="ignis-empty">Could not load this post: ' + esc((e && e.message) || "network error") + "</div>"
      );
      return null;
    }
    if (!modal.el.is(":visible")) return loaded;
    var current = { items: loaded.items, meta: loaded.meta };
    function updateHead() {
      var user = current.meta && current.meta.username && current.meta.username !== "NONE" ? "@" + current.meta.username + " · " : "";
      modal.title.find(".ignis-sub").text(user + current.items.length + " item" + (current.items.length === 1 ? "" : "s"));
    }
    renderItems(modal.body, current.items, current.meta);
    updateHead();
    var selection = attachSelectionFooter(
      modal,
      function () {
        return current.items;
      },
      function () {
        return current.meta;
      }
    );
    if (loaded.fromDom) {
      getPostPayload(postPath)
        .then(function (payload) {
          var rich = buildPostItems(payload, postPath);
          if (rich.items.length && modal.el.is(":visible")) {
            current.items = rich.items;
            current.meta = rich.meta;
            renderItems(modal.body, current.items, current.meta);
            updateHead();
            selection.refresh();
          }
        })
        .catch(function () {});
    }
    return loaded;
  }

  // ─── Story / highlight dialogs ─────────────────────────────────────────
  function openStoryDialog(payload, type) {
    var reel = payload && payload.data && payload.data.reels_media && payload.data.reels_media[0];
    if (!reel) {
      Toasts.error("No stories available for this account.");
      return null;
    }
    var items = normalizeReelItems(reel.items);
    var username =
      (reel.user && reel.user.username) ||
      (reel.owner && reel.owner.username) ||
      getStoryUsername() ||
      "NONE";
    var meta = {
      username: username,
      shortcode: reel.id || "",
      sourceType: type,
      timestamp: Math.floor(Date.now() / 1000),
      caption: null,
    };
    var modal = createModal({
      title: type === "highlights" ? "Highlights" : "Stories",
      sub: "@" + username + " · " + items.length + " item" + (items.length === 1 ? "" : "s"),
    });
    renderItems(modal.body, items, meta);
    var hint = $('<span class="ignis-hint">' + items.length + " item" + (items.length === 1 ? "" : "s") + "</span>");
    attachSelectionFooter(
      modal,
      function () {
        return items;
      },
      function () {
        return meta;
      },
      hint
    );
    return modal;
  }


  // ─── Filename template editor ──────────────────────────────────────────
  function openRenameEditor() {
    var modal = createModal({ title: "Filename template", sub: "Auto rename" });
    var wrap = $('<div class="ignis-rename">');
    var inp = $(
      '<input class="ignis-inp" spellcheck="false" value="' + esc(state.fileRenameFormat) + '" aria-label="Filename template">'
    );
    var preview = $('<div class="ignis-rename-preview"><small>Preview</small><span></span></div>');
    var previewText = preview.find("span");
    var keys = ["USERNAME", "SOURCE_TYPE", "SHORTCODE", "YEAR", "2-YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND", "ORIGINAL_NAME", "ORIGINAL_NAME_FIRST", "INDEX", "UID"];
    var chips = $('<div class="ignis-chips">');
    keys.forEach(function (key) {
      chips.append('<button type="button" class="ignis-chip" data-token="%' + key + '%">%' + key + "%</button>");
    });
    ["-", "_", ".", " ", "(", ")", "[", "]"].forEach(function (sep) {
      chips.append('<button type="button" class="ignis-chip" data-token="' + esc(sep) + '">' + (sep === " " ? "space" : esc(sep)) + "</button>");
    });

    function previewName(format) {
      var now = new Date();
      var tokens = {
        USERNAME: "instagram",
        SOURCE_TYPE: "post",
        SHORTCODE: "C1a2B3c4D5e",
        YEAR: String(now.getFullYear()),
        "2-YEAR": String(now.getFullYear()).slice(-2),
        MONTH: pad2(now.getMonth() + 1),
        DAY: pad2(now.getDate()),
        HOUR: pad2(now.getHours()),
        MINUTE: pad2(now.getMinutes()),
        SECOND: pad2(now.getSeconds()),
        ORIGINAL_NAME: "35000000_44444444_n",
        ORIGINAL_NAME_FIRST: "35000000",
        INDEX: "1",
        UID: "123456789",
      };
      var name = String(format || "").replace(/%([\w\-]+)%/g, function (m, t) {
        var up = t.toUpperCase();
        return tokens[up] != null ? tokens[up] : m;
      });
      return sanitizeFilename(name) + ".jpg";
    }

    function render() {
      var format = inp.val();
      state.fileRenameFormat = format;
      Store.set("G_RENAME_FORMAT", format);
      previewText.text(previewName(format) || "—");
    }

    inp.on("input", render);
    chips.on("click", "button", function () {
      var token = $(this).attr("data-token");
      var el = inp[0];
      var start = el.selectionStart != null ? el.selectionStart : el.value.length;
      var end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
      el.value = el.value.slice(0, start) + token + el.value.slice(end);
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
      render();
    });

    var actions = $('<div class="ignis-chips">');
    var reset = $('<button type="button" class="ignis-btn ignis-btn-sec">Reset to default</button>');
    reset.on("click", function () {
      inp.val("%USERNAME%-%SOURCE_TYPE%-%SHORTCODE%-%YEAR%%MONTH%%DAY%_%HOUR%%MINUTE%%SECOND%_%ORIGINAL_NAME_FIRST%");
      render();
    });
    actions.append(reset);
    wrap.append(inp, preview, chips, '<div class="ignis-divider"></div>', actions);
    modal.body.append(wrap);
    modal.foot.append($('<button class="ignis-btn ignis-btn-pri">Done</button>').on("click", modal.close));
    render();
    setTimeout(function () {
      inp.trigger("focus");
    }, 30);
    return modal;
  }

  // ─── Dashboard settings ────────────────────────────────────────────────
  function showSetting(tab) {
    if (tab) state._igTab = tab;
    if (!CAT_MAP[state._igTab] && state._igTab !== "about") state._igTab = "download";
    while (ModalStack.modals.length) ModalStack.pop();
    $(".ignis-modal").remove();
    var modal = createModal({ title: NAME + " Settings", sub: "v" + VERSION });
    modal.el.addClass("ignis-modal-wide");
    var tabs = $('<div class="ignis-tabs">');
    var search = $('<input class="ignis-search" type="search" placeholder="Search settings…">');
    var list = $("<div>");
    var hero = $(
      '<div class="ignis-hero"><div class="ignis-hero-mark">' + SVG.SPARK + "</div>" +
        "<div><h3>" + esc(NAME) + "</h3><p>Instagram media downloader · v" + esc(VERSION) + "</p></div></div>"
    );
    modal.body.append(hero, tabs, search, list);

    function countOn(cat) {
      var n = 0;
      Object.keys(CAT_MAP).forEach(function (k) {
        if (CAT_MAP[k] === cat && USER_SETTING[k]) n++;
      });
      return n;
    }
    function buildTabs() {
      tabs.empty();
      CATS.forEach(function (c) {
        var on = countOn(c[0]);
        tabs.append(
          '<button class="ignis-tab' +
            (state._igTab === c[0] ? " ignis-tab-a" : "") +
            '" data-tab="' +
            c[0] +
            '">' +
            esc(c[1]) +
            (on ? "<b>" + on + "</b>" : "") +
            "</button>"
        );
      });
      tabs.append(
        '<button class="ignis-tab' +
          (state._igTab === "about" ? " ignis-tab-a" : "") +
          '" data-tab="about">About</button>'
      );
    }

    function keyName(code) {
      try {
        return String.fromCharCode(code);
      } catch (e) {
        return String(code);
      }
    }

    function renderHotkeyEditor(container) {
      var keys = [
        ["settings", "Open Settings", "settingsHotkeyKeyCode"],
        ["downloadStory", "Download Story", "downloadStoryHotkeyKeyCode"],
        ["debug", "Debug Window", "debugHotkeyKeyCode"],
      ];
      keys.forEach(function (k) {
        var code = state[k[2]];
        var row = $('<div class="ignis-keyrow" data-hotkey="' + k[2] + '">');
        row.append(
          '<span class="ignis-kbd"><kbd>' + esc(getPlatformModifierKey()) + "</kbd>+<kbd>" + esc(keyName(code)) + "</kbd></span>",
          $('<div class="ignis-row-txt"><div class="ignis-row-lb">' + esc(k[1]) + "</div></div>"),
          $('<button type="button">Rebind</button>')
        );
        row.on("click", function () {
          container.data("cap", k[2]);
          row.find("button").text("Press a key…");
        });
        container.append(row);
      });
      container.append(
        '<div class="ignis-hint" style="margin:10px 12px;display:block">Click a row, then press the new key. Used with ' +
          esc(getPlatformModifierKey()) +
          ".</div>"
      );
    }

    const STAT_TYPE_LABELS = {
      post: "Posts",
      photo: "Photos",
      video: "Videos",
      reels: "Reels",
      stories: "Stories",
      highlights: "Highlights",
      thumbnail: "Thumbnails",
      avatar: "Profile Pictures",
      caption: "Captions",
      other: "Other",
    };

    function formatBytes(n) {
      n = Number(n) || 0;
      if (n <= 0) return "0 B";
      var units = ["B", "KB", "MB", "GB", "TB"];
      var i = 0;
      while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
      }
      return (i ? n.toFixed(1) : String(Math.round(n))) + " " + units[i];
    }

    function statRow(label, value) {
      return (
        '<div class="ignis-row"><div class="ignis-row-txt"><div class="ignis-row-lb">' +
        esc(label) +
        '</div></div><span class="ignis-stat-v">' +
        esc(value) +
        "</span></div>"
      );
    }

    function buildStatsPanel(onReset) {
      var s = Stats._load();
      var panel = $('<div class="ignis-stats">');
      var cards = $('<div class="ignis-stat-cards">');
      [
        ["Total downloads", String(s.items || 0)],
        ["Data saved", formatBytes(s.bytes)],
        ["Sessions", String(s.sessions || 0)],
        ["Last download", s.lastAt ? new Date(s.lastAt).toLocaleDateString() : "—"],
      ].forEach(function (pair) {
        cards.append(
          '<div class="ignis-stat-card"><small>' +
            esc(pair[0]) +
            '</small><span class="ignis-stat-v">' +
            esc(pair[1]) +
            "</span></div>"
        );
      });
      panel.append(cards);

      var days = [];
      var maxCount = 1;
      for (var i = 13; i >= 0; i--) {
        var day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        var count = (s.byDay && s.byDay[day]) || 0;
        if (count > maxCount) maxCount = count;
        days.push({ day: day, count: count });
      }
      var spark = $('<div class="ignis-spark">');
      days.forEach(function (entry) {
        var pct = entry.count ? Math.max(6, Math.round((entry.count / maxCount) * 100)) : 2;
        spark.append(
          '<div class="ignis-spark-bar" style="height:' +
            pct +
            '%" title="' +
            esc(entry.day + " · " + entry.count + " downloads") +
            '"></div>'
        );
      });
      panel.append('<div class="ignis-stats-h">Last 14 days</div>', spark);
      panel.append(
        statRow("Tracking since", s.firstDay ? new Date(s.firstDay).toLocaleDateString() : "—"),
        statRow("Last download", s.lastAt ? new Date(s.lastAt).toLocaleString() : "—")
      );

      var types = Object.keys(s.byType || {}).sort(function (a, b) {
        return s.byType[b] - s.byType[a];
      });
      if (types.length) {
        panel.append('<div class="ignis-stats-h">By type</div>');
        types.forEach(function (t) {
          panel.append(statRow(STAT_TYPE_LABELS[t] || t, String(s.byType[t])));
        });
      }
      panel.append(
        '<div style="padding:14px 4px 4px"><button class="ignis-btn ignis-btn-sec">Reset statistics</button></div>'
      );
      panel.find("button").on("click", function () {
        Stats.reset();
        Toasts.success("Statistics reset.");
        if (onReset) onReset();
      });
      return panel;
    }

    function buildList(filter) {
      list.empty();
      if (state._igTab === "about") {
        list.append(
          '<div class="ignis-about">' +
            "<b>" + NAME + " v" + VERSION + "</b> downloads media from Instagram pages: posts, carousels, reels, stories, highlights, HD avatars and captions." +
            '<div class="ignis-rt">' +
            ["IGNIS Core", "IGNIS Lens", "IGNIS Forge", "IGNIS Render", "IGNIS Pulse"]
              .map(function (r) {
                return "<span>" + esc(r) + "</span>";
              })
              .join("") +
            "</div>" +
            "All processing is local. Network requests go only to Instagram and its CDN hosts. Nothing is sent anywhere else." +
            '<div class="ignis-divider" style="margin:14px 0"></div>' +
            '<a href="https://github.com/mheci/Ignis" target="_blank" rel="noopener noreferrer">Project page</a> · ' +
            '<a href="https://github.com/mheci/Ignis/issues" target="_blank" rel="noopener noreferrer">Report an issue</a>' +
            '<p class="ignis-hint" style="margin-top:12px">Independent project, unaffiliated with Instagram. GPL-3.0-only.</p>' +
            "</div>"
        );
        return;
      }
      if (state._igTab === "keyboard") {
        renderHotkeyEditor(list);
        return;
      }
      if (state._igTab === "stats") {
        list.append(buildStatsPanel(function () {
          buildList(filter);
        }));
      }
      Object.keys(CAT_MAP)
        .filter(function (k) {
          return CAT_MAP[k] === state._igTab;
        })
        .filter(function (k) {
          if (!filter) return true;
          return (LABEL[k] + " " + DESC[k]).toLowerCase().indexOf(filter) > -1;
        })
        .forEach(function (k) {
          var parent = null;
          Object.keys(PARENT_CHILD_MAPPING).forEach(function (p) {
            if (PARENT_CHILD_MAPPING[p].indexOf(k) > -1) parent = p;
          });
          var disabled = parent ? !USER_SETTING[parent] : false;
          var row = $(
            '<div class="ignis-row ignis-row-wrap' + (disabled ? " ignis-row-dis" : "") + '" data-set="' + k + '">'
          );
          var sw = $(
            '<label class="ignis-sw"><input type="checkbox" aria-label="' + esc(LABEL[k]) + '" ' +
              (USER_SETTING[k] ? "checked" : "") +
              (disabled ? "disabled" : "") +
              "><i></i></label>"
          );
          row.append(
            $('<div class="ignis-row-txt">')
              .append(
                '<div class="ignis-row-lb">' + esc(LABEL[k]) + "</div>",
                '<div class="ignis-row-ds">' + esc(DESC[k]) + "</div>"
              ),
            sw
          );
          if (k === "AUTO_RENAME") {
            row.find(".ignis-row-txt").css("cursor", "pointer").on("click", openRenameEditor);
          }
          list.append(row);
        });
      if (!list.children().length) {
        list.append('<div class="ignis-empty">No settings match.</div>');
      }
    }

    modal.el.on("keydown.igcap", function (e) {
      var cap = list.data("cap");
      if (!cap) return;
      e.preventDefault();
      e.stopPropagation();
      var code = e.keyCode || e.which;
      state[cap] = code;
      Store.set("G_HOTKEY_" + cap.replace("HotkeyKeyCode", "").toUpperCase() + "_KEYCODE", code);
      list.data("cap", null);
      buildList();
    });

    modal.el.on("change.igset", ".ignis-sw input", function () {
      var $row = $(this).closest(".ignis-row");
      var k = $row.attr("data-set");
      var v = this.checked;
      USER_SETTING[k] = v;
      Store.set(k, v);
      buildTabs();
      buildList();
    });

    modal.el.on("contextmenu.igset", ".ignis-row[data-set]", function (e) {
      e.preventDefault();
      var $row = $(this);
      var k = $row.attr("data-set");
      if (k !== "AUTO_RENAME") return;
      openRenameEditor();
    });

    tabs.on("click.igset", ".ignis-tab", function () {
      state._igTab = $(this).attr("data-tab");
      buildTabs();
      buildList();
    });
    search.on("input.igset", function () {
      buildList(search.val().trim().toLowerCase());
    });
    buildTabs();
    buildList();
  }

  function showHotkeySetting() {
    showSetting("keyboard");
  }

  // ─── Debug & feedback ──────────────────────────────────────────────────
  function showDebugDOM() {
    var modal = createModal({ title: "Debug Window", sub: NAME + " v" + VERSION });
    var ta = $(
      '<textarea spellcheck="false" style="width:100%;height:240px;box-sizing:border-box;border:1px solid var(--ig-line);border-radius:10px;background:var(--ig-surface-2);color:var(--ig-text);font:11px ui-monospace,Menlo,monospace;padding:10px;resize:vertical"></textarea>'
    );
    modal.body.append(ta);
    modal.foot.append(
      $('<button class="ignis-btn ignis-btn-sec">Copy</button>').on("click", function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(ta.val()).then(function () {
            Toasts.success("Copied to clipboard.");
          });
        } else {
          ta.trigger("select");
          document.execCommand("copy");
        }
      }),
      $('<button class="ignis-btn ignis-btn-sec">Download</button>').on("click", function () {
        var blob = new Blob([ta.val()], { type: "text/plain;charset=utf-8" });
        triggerDownload(blob, "ignis-debug-" + Date.now() + ".txt");
      })
    );
    var lines = [];
    lines.push(NAME + " v" + VERSION + " — URL: " + location.href);
    lines.push("UA: " + navigator.userAgent);
    lines.push("");
    lines.push("— Log —");
    state.GL_logger.slice(-500).forEach(function (entry) {
      lines.push("[" + new Date(entry.time).toISOString() + "] " + entry.content.map(String).join(" "));
    });
    ta.val(lines.join("\n"));
  }

  function showFeedbackDOM() {
    var modal = createModal({ title: "About", sub: NAME + " v" + VERSION });
    modal.body.append(
      '<div class="ignis-about">' +
        NAME +
        " is an independent, self-contained userscript. It sends no data anywhere and is not affiliated with any other project or maintainer.</div>"
    );
  }
