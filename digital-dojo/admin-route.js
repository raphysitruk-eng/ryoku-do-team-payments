(function(){
 "use strict";
 try{
  var params=new URLSearchParams(location.search);
  if(params.get("legacy")==="1")return;
  location.replace("./control.html?view=overview");
 }catch(error){location.replace("./control.html")}
})();