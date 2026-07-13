
(() => {
  const menuToggle = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.nav-menu');
  const desktopActions = document.querySelector('.nav-actions');

  // Add the existing brochure and quote actions inside the responsive menu.
  // The desktop buttons remain unchanged; these copies are displayed only at mobile/tablet widths.
  if(menu && desktopActions && !menu.querySelector('.mobile-menu-actions')){
    const mobileActions = document.createElement('li');
    mobileActions.className = 'mobile-menu-actions';

    const brochureButton = desktopActions.querySelector('[data-brochure-download], .brochure-download-trigger');
    const quoteButton = desktopActions.querySelector('.btn-primary');

    if(brochureButton){
      const brochureCopy = brochureButton.cloneNode(true);
      brochureCopy.classList.add('mobile-brochure-btn');
      mobileActions.appendChild(brochureCopy);
    }

    if(quoteButton){
      const quoteCopy = quoteButton.cloneNode(true);
      quoteCopy.classList.add('mobile-quote-btn');
      const quoteHref = (quoteCopy.getAttribute('href') || 'contact.html#contact-dashboard')
        .replace('#enquiry', '#contact-dashboard');
      quoteCopy.setAttribute('href', quoteHref);
      mobileActions.appendChild(quoteCopy);
    }

    if(mobileActions.children.length) menu.appendChild(mobileActions);
  }

  const closeMenu = () => {
    if(!menu || !menuToggle) return;
    menu.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open menu');
  };

  if(menuToggle && menu){
    menuToggle.addEventListener('click',()=>{
      const isOpen = menu.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
      menuToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    });

    menu.addEventListener('click',event=>{
      const link = event.target.closest('a');
      if(link && !link.classList.contains('nav-link')) closeMenu();
    });

    document.addEventListener('click',event=>{
      if(innerWidth<=1050 && menu.classList.contains('open') && !event.target.closest('.site-nav')) closeMenu();
    });

    document.addEventListener('keydown',event=>{
      if(event.key==='Escape' && menu.classList.contains('open')) closeMenu();
    });

    window.addEventListener('resize',()=>{
      if(innerWidth>1050) closeMenu();
    });
  }
  document.querySelectorAll('.dropdown > .nav-link').forEach(link=>link.addEventListener('click',e=>{
    if(innerWidth<=1050){e.preventDefault();link.parentElement.classList.toggle('open')}
  }));

  const slides=[...document.querySelectorAll('.carousel-slide')];
  const dots=[...document.querySelectorAll('.carousel-dot')];
  if(slides.length){
    let index=0,timer=null,paused=false;
    const HOLD_MS=2000;       // Keep each slide completely still for 2 seconds.
    const TRANSITION_MS=980;  // Cinematic depth-and-lens reveal into the next slide.
    const stage=document.querySelector('.carousel-stage');
    const paint=()=>{slides.forEach((s,i)=>{s.className='carousel-slide';const delta=(i-index+slides.length)%slides.length;if(delta===0)s.classList.add('active');else if(delta===1)s.classList.add('next');else if(delta===slides.length-1)s.classList.add('prev');else s.classList.add('hidden')});dots.forEach((d,i)=>d.classList.toggle('active',i===index))};
    const clear=()=>{if(timer){clearTimeout(timer);timer=null}};
    const snapTo=n=>{
      if(paused)return;
      stage?.classList.add('is-snapping');
      requestAnimationFrame(()=>{index=(n+slides.length)%slides.length;paint()});
      window.setTimeout(()=>stage?.classList.remove('is-snapping'),TRANSITION_MS+35);
    };
    const schedule=(delay=HOLD_MS)=>{clear();if(!paused)timer=setTimeout(()=>{snapTo(index+1);schedule(TRANSITION_MS+HOLD_MS)},delay)};
    const go=n=>{stage?.classList.add('is-snapping');index=(n+slides.length)%slides.length;paint();window.setTimeout(()=>stage?.classList.remove('is-snapping'),TRANSITION_MS+35);schedule(TRANSITION_MS+HOLD_MS)};
    document.querySelector('.carousel-next')?.addEventListener('click',()=>go(index+1));
    document.querySelector('.carousel-prev')?.addEventListener('click',()=>go(index-1));
    dots.forEach((d,i)=>d.addEventListener('click',()=>go(i)));
    stage?.addEventListener('mouseenter',()=>{paused=true;clear()});
    stage?.addEventListener('mouseleave',()=>{paused=false;schedule(HOLD_MS)});
    let x=0;
    stage?.addEventListener('touchstart',e=>{paused=true;clear();x=e.touches[0].clientX},{passive:true});
    stage?.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-x;paused=false;if(Math.abs(dx)>45)go(index+(dx<0?1:-1));else schedule(HOLD_MS)},{passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){paused=true;clear()}else{paused=false;schedule(HOLD_MS)}});
    paint();schedule(HOLD_MS);
  }
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}}),{threshold:.12});
  document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));

  document.querySelectorAll('[data-mail-form]').forEach(form=>form.addEventListener('submit',e=>{
    e.preventDefault();const fd=new FormData(form);const lines=[];for(const [k,v] of fd.entries()) lines.push(`${k}: ${v}`);
    const subject=encodeURIComponent('Website enquiry - '+(fd.get('Product')||'Therm-X Innovations'));
    const body=encodeURIComponent(lines.join('\n'));
    window.location.href=`mailto:sales@thermxinnovations.com?subject=${subject}&body=${body}`;
  }));


  // Homepage product details reveal below the complete 9-card grid.
  const productDataNode=document.getElementById('homepage-product-data');
  const productReveal=document.getElementById('product-detail-reveal');
  if(productDataNode && productReveal){
    let productData={};
    try{productData=JSON.parse(productDataNode.textContent)}catch(error){console.error('Unable to read homepage product data.',error)}
    const setList=(selector,items)=>{
      const list=productReveal.querySelector(selector);
      list.innerHTML='';
      (items&&items.length?items:['Custom configurations are available based on the test requirement.']).forEach(text=>{
        const li=document.createElement('li');li.textContent=text;list.appendChild(li);
      });
    };
    const closeReveal=()=>{
      productReveal.hidden=true;
      document.querySelectorAll('.product-reveal-trigger').forEach(btn=>btn.setAttribute('aria-expanded','false'));
      document.querySelectorAll('[data-product-card]').forEach(card=>card.classList.remove('is-selected'));
    };
    document.querySelectorAll('.product-reveal-trigger').forEach(button=>button.addEventListener('click',()=>{
      const slug=button.dataset.product;
      const product=productData[slug];
      if(!product)return;
      productReveal.querySelector('.product-detail-image').src=product.image;
      productReveal.querySelector('.product-detail-image').alt=product.title;
      productReveal.querySelector('.product-detail-code').textContent=product.code;
      productReveal.querySelector('.product-detail-title').textContent=product.title;
      productReveal.querySelector('.product-detail-description').textContent=product.description;
      productReveal.querySelector('.product-detail-page-link').href=product.page;
      setList('.product-detail-performance',product.performance);
      setList('.product-detail-features',product.features);
      setList('.product-detail-applications',product.applications);
      document.querySelectorAll('.product-reveal-trigger').forEach(btn=>btn.setAttribute('aria-expanded',String(btn===button)));
      document.querySelectorAll('[data-product-card]').forEach(card=>card.classList.toggle('is-selected',card.dataset.productCard===slug));
      productReveal.hidden=false;
      productReveal.querySelector('.product-detail-shell').style.animation='none';
      void productReveal.offsetWidth;
      productReveal.querySelector('.product-detail-shell').style.animation='';
      productReveal.scrollIntoView({behavior:'smooth',block:'start'});
    }));
    productReveal.querySelector('.product-detail-close')?.addEventListener('click',closeReveal);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!productReveal.hidden)closeReveal()});
  }

})();


// Brochure download confirmation. Add the final PDF at:
// assets/docs/Therm-X-Innovations-Brochure.pdf
(() => {
  const triggers=[...document.querySelectorAll('[data-brochure-download],.brochure-download-trigger')];
  if(!triggers.length)return;

  const backdrop=document.createElement('div');
  backdrop.className='brochure-confirm-backdrop';
  backdrop.setAttribute('aria-hidden','true');
  backdrop.innerHTML=`
    <div class="brochure-confirm-card" role="dialog" aria-modal="true" aria-labelledby="brochure-confirm-title">
      <div class="brochure-confirm-icon">↓</div>
      <h3 id="brochure-confirm-title">Download Brochure?</h3>
      <p>Confirm to download the Therm-X Innovations brochure PDF.</p>
      <div class="brochure-confirm-actions">
        <button class="brochure-confirm-cancel" type="button">Cancel</button>
        <button class="brochure-confirm-download" type="button">Download PDF</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  const close=()=>{backdrop.classList.remove('is-open');backdrop.setAttribute('aria-hidden','true')};
  const open=()=>{backdrop.classList.add('is-open');backdrop.setAttribute('aria-hidden','false');backdrop.querySelector('.brochure-confirm-download')?.focus()};

  triggers.forEach(trigger=>trigger.addEventListener('click',event=>{event.preventDefault();open()}));
  backdrop.querySelector('.brochure-confirm-cancel')?.addEventListener('click',close);
  backdrop.addEventListener('click',event=>{if(event.target===backdrop)close()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&backdrop.classList.contains('is-open'))close()});
  backdrop.querySelector('.brochure-confirm-download')?.addEventListener('click',()=>{
    const inProductFolder=window.location.pathname.includes('/products/');
    const pdfPath=inProductFolder?'../assets/docs/Therm-X-Innovations-Brochure.pdf':'assets/docs/Therm-X-Innovations-Brochure.pdf';
    const link=document.createElement('a');
    link.href=pdfPath;
    link.download='Therm-X-Innovations-Brochure.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    close();
  });
})();

// Premium footer entrance animation
(() => {
  const footer=document.querySelector('.site-footer');
  if(!footer)return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    footer.classList.add('is-visible');
    return;
  }
  footer.classList.add('footer-motion');
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        footer.classList.add('is-visible');
        observer.disconnect();
      }
    });
  },{threshold:.12});
  observer.observe(footer);
})();
