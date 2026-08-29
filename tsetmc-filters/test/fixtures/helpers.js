// توکن‌های کمکی سایت (استخراج‌شده از صفحه‌ی دیده‌بان بازار) — فقط برای اجرای تست

function addCommas(a,c){if(typeof c=="undefined"){c=3}a+="";x=a.split(".");x1=x[0];x2=x.length>1?(parseInt(x[1],10)!=0?"."+x[1].substring(0,c):""):"";var b=/(\d+)(\d{3})/;while(b.test(x1)){x1=x1.replace(b,"$1,$2")}return x1+x2}

function bigNumber(a,c){var b=parseFloat(a);var d;if(b>1000000000){d=addCommas(Math.round(b/1000000)/1000,c)+" B"}else{if(b>1000000){d=addCommas(Math.round(b/1000)/1000,c)+" M"}else{d=addCommas(a,c)}}return'<div class="ltr inline" title="'+addCommas(a)+'">'+d+"</div>"}

function colorNum(a){if(a>0){return"<span style='color:green'>"+a+"</span>"}else{if(a<0){return"<span style='color:red'>-"+(-a)+"</span>"}else{return a}}}

function AdvRound(b,a){return Math.round(b*Math.pow(10,a))/Math.pow(10,a)}

function getData(b){try{return window.localStorage.getItem(b)}catch(a){}}

function setData(b,c){try{window.localStorage.setItem(b,c)}catch(a){}}