/**
 * Debug script — enumerate all buttons in all frames
 */
(() => {
  try {
    const results = {};
    
    // Frame 1: document (child frame / execution context)
    const allBtns1 = Array.from(document.querySelectorAll('button'));
    const visibleBtns1 = allBtns1.filter(b => b.offsetWidth > 0);
    const menuBtns1 = visibleBtns1.filter(b => b.getAttribute('aria-haspopup') === 'menu');
    results.childFrame = {
      hasRoot: !!document.getElementById('root'),
      totalBtns: allBtns1.length,
      visibleBtns: visibleBtns1.length,
      menuBtns: menuBtns1.length,
      menuBtnTexts: menuBtns1.map(b => (b.textContent||'').trim().slice(0,40)),
      sampleBtnTexts: visibleBtns1.slice(0,10).map(b => ({
        t: (b.textContent||'').trim().slice(0,40),
        hp: b.getAttribute('aria-haspopup'),
        w: b.offsetWidth
      }))
    };
    
    // Frame 2: inner iframe (if available)
    const iframes = document.querySelectorAll('iframe');
    results.iframeCount = iframes.length;
    for (let i = 0; i < Math.min(iframes.length, 3); i++) {
      try {
        const innerDoc = iframes[i].contentDocument || iframes[i].contentWindow?.document;
        if (innerDoc) {
          const allBtns2 = Array.from(innerDoc.querySelectorAll('button'));
          const visibleBtns2 = allBtns2.filter(b => b.offsetWidth > 0);
          const menuBtns2 = visibleBtns2.filter(b => b.getAttribute('aria-haspopup') === 'menu');
          results['innerFrame_' + i] = {
            hasRoot: !!innerDoc.getElementById('root'),
            url: iframes[i].src?.slice(0, 100),
            totalBtns: allBtns2.length,
            visibleBtns: visibleBtns2.length,
            menuBtns: menuBtns2.length,
            menuBtnTexts: menuBtns2.map(b => (b.textContent||'').trim().slice(0,40)),
            sampleBtnTexts: visibleBtns2.slice(0,10).map(b => ({
              t: (b.textContent||'').trim().slice(0,40),
              hp: b.getAttribute('aria-haspopup'),
              w: b.offsetWidth
            }))
          };
        }
      } catch(e) {
        results['innerFrame_' + i] = { error: e.message };
      }
    }
    
    return JSON.stringify(results);
  } catch(e) {
    return JSON.stringify({error: e.message});
  }
})()
