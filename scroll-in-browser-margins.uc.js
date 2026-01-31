// ==UserScript==
// @name           Edge Scrollbar - Bottom Edge Support
// @description    Left + Bottom Edge Scrolling, with Prefs Support for Right Side.
// @author         Your Name + performance optimizations
// @include        main
// ==/UserScript==

(function() {
  'use strict';

  // --- PREFERENCE CHECK 1: Global Kill Switch ---
  try {
    // 1. Exit if the user specifically enabled top-corners
    if (Services.prefs.getBoolPref("userChrome.ui-rounded-top-corners", false)) {
      return;
    }

    // 2. Exit if the original rounded-corners is disabled
    if (!Services.prefs.getBoolPref("userChrome.ui-rounded-corners", true)) {
      return;
    }
  } catch (e) {}

  // --- PREFERENCE CHECK 2: Flush Mode ---
  // If TRUE: Right side becomes transparent to mouse (native hover works).
  // If FALSE: Right side acts as the script's scrollbar (Solid Drag).
  let flushMode = false;
  try {
    flushMode = Services.prefs.getBoolPref("userChrome.ui-rounded-corners-flush-scrollbar", false);
  } catch (e) {}

  const EDGE_WIDTH = 4;
  const WHEEL_SCALE = 17.06;
  const MIN_THUMB = 30;
  const THUMB_TOLERANCE = 80;
  const PAGE_JUMP = 0.9;
  const CACHE_TIME = 250;
  const SNAP_THRESHOLD = 5;
  const STOP_VEL = 0.5;
  const STOP_DIST = 0.5;

  const FRAME_SCRIPT = `
    var scrollState = {
      isDragging: false,
      isAnimating: false,
      currentY: 0,
      targetY: 0,
      velocity: 0,
      stiffness: 2304,
      damping: 96,
      lastFrameTime: 0,
      grabOffsetRatio: 0,
      isHoldScrolling: false,
      holdAcceleration: 1,
      cachedScrollable: null,
      lastScrollableCheck: 0,
      rafId: null,
      holdRafId: null,
      dragRafId: null,
      lastDragData: null,
      dragStartScrollHeight: 0,
      dragStartClientHeight: 0
    };
    
    var lastURL = content.location.href;
    
    function preWarm() {
      getScrollableElement();
    }
    
    content.addEventListener('DOMContentLoaded', function() {
      content.setTimeout(preWarm, 50);
    }, true);
    
    content.addEventListener('load', function() {
      scrollState.cachedScrollable = null;
      content.setTimeout(preWarm, 100);
    }, true);
    
    content.setInterval(function() {
      if (!scrollState.isDragging && content.location.href !== lastURL) {
        lastURL = content.location.href;
        content.setTimeout(function() {
          scrollState.cachedScrollable = null;
          preWarm();
        }, 200);
      }
    }, 500);

    var findScrollable = function(el, depth, list) {
      if (!el || el.nodeType !== 1 || depth > 15) return;
      
      try {
        var style = content.getComputedStyle(el);
        var oy = style.overflowY;
        
        if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && 
            el.scrollHeight > el.clientHeight + 5) {
          var rect = el.getBoundingClientRect();
          var sh = el.scrollHeight - el.clientHeight;
          var co = Math.abs(rect.left + rect.width * 0.5 - content.innerWidth * 0.5);
          list.push({ 
            el: el, 
            score: sh * 2 + (rect.width * rect.height) / 1000 - co / 10 
          });
        }
        
        var children = el.children;
        var len = children.length;
        for (var i = 0; i < len; i++) {
          findScrollable(children[i], depth + 1, list);
        }
      } catch(e) {}
    };

    function getScrollableElement() {
      try {
        var now = Date.now();
        if ((scrollState.isDragging || scrollState.isAnimating || scrollState.isHoldScrolling) && scrollState.cachedScrollable) {
          return scrollState.cachedScrollable;
        }
        if (scrollState.cachedScrollable && (now - scrollState.lastScrollableCheck) < ${CACHE_TIME}) {
          return scrollState.cachedScrollable;
        }
        
        scrollState.lastScrollableCheck = now;
        var docElement = content.document.scrollingElement || content.document.documentElement;
        
        if (docElement && docElement.scrollHeight > docElement.clientHeight + 10) {
          if (docElement.style) docElement.style.scrollBehavior = 'auto';
          scrollState.cachedScrollable = docElement;
          return docElement;
        }
        
        var scrollables = [];
        var body = content.document.body;
        if (body) findScrollable(body, 0, scrollables);
        
        if (scrollables.length > 0) {
          scrollables.sort(function(a, b) { return b.score - a.score; });
          var best = scrollables[0].el;
          if (best.style) best.style.scrollBehavior = 'auto';
          scrollState.cachedScrollable = best;
          return best;
        }
        
        if (docElement.style) docElement.style.scrollBehavior = 'auto';
        scrollState.cachedScrollable = docElement;
        return docElement;
      } catch(e) {
        return content.document.scrollingElement || content.document.documentElement;
      }
    }

    function smoothScroll(target) {
      var el = getScrollableElement();
      if (!el) return;
      
      if (el.style) el.style.scrollBehavior = 'auto';
      scrollState.targetY = target;
      
      if (!scrollState.isAnimating) {
        scrollState.currentY = el.scrollTop;
      }
      
      if (Math.abs(scrollState.currentY - target) < ${SNAP_THRESHOLD}) {
        el.scrollTop = target;
        scrollState.currentY = target;
        scrollState.velocity = 0;
        return;
      }
      
      if (scrollState.isAnimating) return;
      
      scrollState.isAnimating = true;
      scrollState.lastFrameTime = content.performance.now();
      
      var step = function(now) {
        if (!scrollState.isAnimating) return;
        
        var dt = Math.min((now - scrollState.lastFrameTime) / 1000, 0.016);
        scrollState.lastFrameTime = now;
        var disp = scrollState.currentY - scrollState.targetY;
        var acc = (-scrollState.stiffness * disp - scrollState.damping * scrollState.velocity);
        
        scrollState.velocity += acc * dt;
        scrollState.currentY += scrollState.velocity * dt;
        el.scrollTop = Math.round(scrollState.currentY);

        if (Math.abs(disp) < ${STOP_DIST} && Math.abs(scrollState.velocity) < ${STOP_VEL}) {
          el.scrollTop = scrollState.targetY;
          scrollState.currentY = scrollState.targetY;
          scrollState.isAnimating = false;
          scrollState.velocity = 0;
          scrollState.rafId = null;
          return;
        }
        scrollState.rafId = content.requestAnimationFrame(step);
      };
      scrollState.rafId = content.requestAnimationFrame(step);
    }

    function getVpMax(el) {
      var isDoc = el === content.document.scrollingElement || 
                  el === content.document.documentElement || 
                  el === content.document.body;
      var vh = isDoc ? content.innerHeight : el.clientHeight;
      return { vh: vh, max: el.scrollHeight - vh };
    }

    addMessageListener("EdgeScroll:CheckThumb", function(msg) {
      var el = getScrollableElement();
      if (!el) return;
      
      var vm = getVpMax(el);
      if (vm.max <= 0) return;
      
      var th = Math.max(${MIN_THUMB}, (vm.vh / el.scrollHeight) * msg.data.wh);
      var track = msg.data.wh - th;
      var tpos = (el.scrollTop / vm.max) * track;
      var cy = msg.data.cy;

      if (cy >= tpos - ${THUMB_TOLERANCE} && cy <= tpos + th + ${THUMB_TOLERANCE}) {
        sendAsyncMessage("EdgeScroll:ShouldDrag", { 
          cy: cy, 
          gr: Math.max(0, Math.min(1, (cy - tpos) / th))
        });
      } else {
        var up = cy < tpos;
        var dist = vm.vh * ${PAGE_JUMP};
        smoothScroll(up ? Math.max(0, el.scrollTop - dist) : Math.min(vm.max, el.scrollTop + dist));
        content.setTimeout(function() {
          sendAsyncMessage("EdgeScroll:CheckIfHolding", { cy: cy, wh: msg.data.wh, up: up });
        }, 40);
      }
    });

    addMessageListener("EdgeScroll:StartDrag", function(msg) {
      var el = getScrollableElement();
      if (el && el.style) el.style.scrollBehavior = 'auto';
      
      if (el) {
        scrollState.dragStartScrollHeight = el.scrollHeight;
        scrollState.dragStartClientHeight = el.clientHeight;
      }
      scrollState.isDragging = true;
      if (scrollState.rafId) {
        content.cancelAnimationFrame(scrollState.rafId);
        scrollState.isAnimating = false;
        scrollState.rafId = null;
      }
      scrollState.grabOffsetRatio = msg.data.gr;
    });

    addMessageListener("EdgeScroll:DoDrag", function(msg) {
      if (!scrollState.isDragging) return;
      scrollState.lastDragData = msg.data;
      
      if (!scrollState.dragRafId) {
        scrollState.dragRafId = content.requestAnimationFrame(function() {
          scrollState.dragRafId = null;
          if (!scrollState.isDragging) return;
          
          var el = getScrollableElement();
          if (!el) return;
          
          if (el.style) el.style.scrollBehavior = 'auto';
          
          var sh = scrollState.dragStartScrollHeight || el.scrollHeight;
          var ch = scrollState.dragStartClientHeight || el.clientHeight;
          var isDoc = el === content.document.scrollingElement || el === content.document.documentElement || el === content.document.body;
          var vh = isDoc ? content.innerHeight : ch;
          var max = sh - vh;
          if (max <= 0) return;
          
          var d = scrollState.lastDragData;
          var th = Math.max(${MIN_THUMB}, (vh / sh) * d.wh);
          var track = d.wh - th;
          var ratio = Math.max(0, Math.min(1, (d.cy - scrollState.grabOffsetRatio * th) / track));
          el.scrollTop = ratio * max;
        });
      }
    });

    addMessageListener("EdgeScroll:EndDrag", function() { 
      scrollState.isDragging = false;
      if (scrollState.dragRafId) {
        content.cancelAnimationFrame(scrollState.dragRafId);
        scrollState.dragRafId = null;
      }
    });

    addMessageListener("EdgeScroll:StartHoldScroll", function(msg) {
      if (scrollState.isHoldScrolling) return;
      
      scrollState.isHoldScrolling = true;
      scrollState.holdAcceleration = 1;
      var el = getScrollableElement();
      if (!el) {
        scrollState.isHoldScrolling = false;
        return;
      }
      
      if (el.style) el.style.scrollBehavior = 'auto';
      var fc = 0;
      
      var doHold = function() {
        if (!scrollState.isHoldScrolling || fc++ > 10000) {
          scrollState.isHoldScrolling = false;
          scrollState.holdRafId = null;
          return;
        }

        var vm = getVpMax(el);
        if (vm.max <= 0) {
          scrollState.isHoldScrolling = false;
          scrollState.holdRafId = null;
          return;
        }
        
        var th = Math.max(${MIN_THUMB}, (vm.vh / el.scrollHeight) * msg.data.wh);
        var tc = (el.scrollTop / vm.max) * (msg.data.wh - th) + th * 0.5;

        if ((msg.data.up && tc <= msg.data.cy) || (!msg.data.up && tc >= msg.data.cy)) {
          scrollState.isHoldScrolling = false;
          scrollState.holdRafId = null;
          return;
        }

        scrollState.holdAcceleration = Math.min(scrollState.holdAcceleration + 0.2, 15);
        el.scrollTop += (msg.data.up ? -12 : 12) * scrollState.holdAcceleration;
        scrollState.holdRafId = content.requestAnimationFrame(doHold);
      };
      scrollState.holdRafId = content.requestAnimationFrame(doHold);
    });

    addMessageListener("EdgeScroll:StopHoldScroll", function() {
      scrollState.isHoldScrolling = false;
      if (scrollState.holdRafId) {
        content.cancelAnimationFrame(scrollState.holdRafId);
        scrollState.holdRafId = null;
      }
    });

    addMessageListener("EdgeScroll:Wheel", function(msg) {
      var el = getScrollableElement();
      if (!el) return;
      
      if (el.style) el.style.scrollBehavior = 'auto';
      var vm = getVpMax(el);
      var base = scrollState.isAnimating ? scrollState.targetY : el.scrollTop;
      smoothScroll(Math.max(0, Math.min(vm.max, base + msg.data.d)));
    });
  `;

  const FRAME_SCRIPT_URI = "data:," + encodeURIComponent(FRAME_SCRIPT);
  let isDragging = false;
  let mouseIsDown = false;
  let cachedTop = 0;
  let cachedHeight = 0;
  let isFullscreen = false;

  function onDragMouseMove(e) {
    if (isFullscreen) return;
    const browser = gBrowser.selectedBrowser;
    if (!browser || !browser.messageManager) return;
    
    browser.messageManager.sendAsyncMessage("EdgeScroll:DoDrag", { 
      cy: e.clientY - cachedTop, 
      wh: cachedHeight
    }); 
  }

  window.messageManager.loadFrameScript(FRAME_SCRIPT_URI, true);
  
  window.messageManager.addMessageListener("EdgeScroll:ShouldDrag", function(msg) { 
    isDragging = true; 
    window.addEventListener('mousemove', onDragMouseMove, true);
    msg.target.messageManager.sendAsyncMessage("EdgeScroll:StartDrag", { gr: msg.data.gr }); 
  });
  
  window.messageManager.addMessageListener("EdgeScroll:CheckIfHolding", function(msg) { 
    if (mouseIsDown && !isDragging) {
      msg.target.messageManager.sendAsyncMessage("EdgeScroll:StartHoldScroll", msg.data); 
    }
  });

  function handleWheel(e) {
    if (isFullscreen) return;
    const browser = gBrowser.selectedBrowser;
    if (!browser || !browser.messageManager) return;
    
    browser.messageManager.sendAsyncMessage("EdgeScroll:Wheel", { d: e.deltaY * WHEEL_SCALE });
    e.preventDefault();
  }

  function createOverlay(id, side) {
    const overlay = document.createXULElement('box');
    overlay.id = id;
    
    // NEW LOGIC: Handle bottom bar vs vertical bars
    if (side === 'bottom') {
      // Bottom: Fixed to bottom, Left 0, Right 4px (to avoid right scrollbar/drag area)
      overlay.style.cssText = 'position:fixed;bottom:0;left:0;right:' + EDGE_WIDTH + 'px;height:' + EDGE_WIDTH + 'px;z-index:2147483647;background:transparent;pointer-events:auto;will-change:transform';
    } else {
      // Vertical: Left/Right
      const pos = side === 'left' ? 'left:0' : 'right:0';
      let pe = 'auto';
      if (side === 'right' && flushMode) {
        pe = 'none';
      }
      overlay.style.cssText = 'position:fixed;top:0;' + pos + ';width:' + EDGE_WIDTH + 'px;z-index:2147483647;background:transparent;pointer-events:' + pe + ';will-change:transform';
    }
    return overlay;
  }

  function init() {
    const browserBox = document.getElementById('browser');
    if (!browserBox) return;
    
    const leftOverlay = createOverlay('edge-scroll-left', 'left');
    const rightOverlay = createOverlay('edge-scroll-right', 'right');
    const bottomOverlay = createOverlay('edge-scroll-bottom', 'bottom'); // New Bottom Bar
    
    let posRaf = null;
    const updatePositions = function() {
      if (posRaf) return;
      posRaf = window.requestAnimationFrame(() => {
        const rect = browserBox.getBoundingClientRect();
        cachedTop = rect.top;
        cachedHeight = rect.height;
        const t = cachedTop + 'px';
        const h = cachedHeight + 'px';
        
        // Vertical bars get Top/Height
        leftOverlay.style.top = rightOverlay.style.top = t;
        leftOverlay.style.height = rightOverlay.style.height = h;
        
        // Bottom bar uses CSS "bottom:0" so it doesn't need dynamic updates
        posRaf = null;
      });
    };
    
    updatePositions();
    window.addEventListener('resize', updatePositions, { passive: true });
    window.addEventListener('TabSelect', updatePositions, { passive: true });
    
    const handleFullscreen = function() {
      isFullscreen = !!(document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement);
      const display = isFullscreen ? 'none' : '';
      leftOverlay.style.display = rightOverlay.style.display = bottomOverlay.style.display = display;
    };
    
    document.addEventListener('fullscreenchange', handleFullscreen);
    document.addEventListener('mozfullscreenchange', handleFullscreen);
    document.addEventListener('webkitfullscreenchange', handleFullscreen);

    const opts = { passive: false, capture: true };
    leftOverlay.addEventListener('wheel', handleWheel, opts);
    rightOverlay.addEventListener('wheel', handleWheel, opts);
    bottomOverlay.addEventListener('wheel', handleWheel, opts); // Enable Wheel on Bottom
    
    if (!flushMode) {
      rightOverlay.addEventListener('mousedown', function(e) {
        if (e.button !== 0 || isFullscreen) return;
        mouseIsDown = true;
        
        const rect = browserBox.getBoundingClientRect();
        cachedTop = rect.top;
        cachedHeight = browserBox.clientHeight;
        
        const browser = gBrowser.selectedBrowser;
        if (!browser || !browser.messageManager) return;
        
        browser.messageManager.sendAsyncMessage("EdgeScroll:CheckThumb", { 
          cy: e.clientY - cachedTop, 
          wh: cachedHeight 
        });
        e.preventDefault();
      }, true);
    }

    browserBox.appendChild(leftOverlay);
    browserBox.appendChild(rightOverlay);
    browserBox.appendChild(bottomOverlay);

    window.addEventListener('mouseup', function() {
      mouseIsDown = false;
      const browser = gBrowser.selectedBrowser;
      if (browser && browser.messageManager) {
        browser.messageManager.sendAsyncMessage("EdgeScroll:StopHoldScroll", {});
        if (isDragging) { 
          browser.messageManager.sendAsyncMessage("EdgeScroll:EndDrag", {}); 
          isDragging = false; 
          window.removeEventListener('mousemove', onDragMouseMove, true);
        }
      }
    }, true);
  }

  if (gBrowserInit.delayedStartupFinished) init();
  else Services.obs.addObserver(function() { init(); }, 'browser-delayed-startup-finished');
})();