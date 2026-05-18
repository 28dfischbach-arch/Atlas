(function(){
  try{
    var ap=JSON.parse(localStorage.getItem('atlas_profile')||'null');
    if(!ap||!ap.email) return;
    localStorage.setItem('stck_session',JSON.stringify({email:ap.email,name:ap.name||'You',ts:Date.now()}));
    var key='stck_'+btoa(ap.email).replace(/=/g,'');
    var s=null;try{s=JSON.parse(localStorage.getItem(key)||'null');}catch(e){}
    if(!s)s={};
    if(typeof s.onboardingDone==='undefined')s.onboardingDone=true;
    if(!s.aiName)s.aiName='Atlas';if(!s.aiPersonality)s.aiPersonality='professional';
    if(!s.payFrequency&&ap.payFrequency)s.payFrequency=ap.payFrequency;
    if(!s.payType)s.payType='hourly';
    if(typeof s.payAmount==='undefined'&&ap.hourlyRate)s.payAmount=Number(ap.hourlyRate)||0;
    if(typeof s.connectedTools==='undefined')s.connectedTools={email:false,cashapp:false,google:false,receipt:true};
    localStorage.setItem(key,JSON.stringify(s));
    var st=document.createElement('style');
    st.textContent='#auth-screen,#onboard-step1,#onboard-income,#onboard-step2,#onboard-step3,[data-section="profile"],[class*="color-picker"],[class*="color-swatch"],[id*="colorPicker"],[id*="themeColor"],[class*="name-editor"],[id*="nameEdit"],[class*="avatar-section"]{display:none!important}';
    (document.head||document.documentElement).appendChild(st);
    document.addEventListener('DOMContentLoaded',function(){
      var nameEls=document.querySelectorAll('[id*="userName"],[id*="user-name"],[class*="user-name"],[class*="display-name"]');
      nameEls.forEach(function(el){if(el&&el.textContent&&el.textContent.trim())el.textContent=ap.name||'You';});
    });
  }catch(e){}
})();