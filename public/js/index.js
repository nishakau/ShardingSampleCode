function onAddToCart(key){
    // alert(key);
    let dataToSend = {key:key};
   
    $.ajax({
        method: "POST",
        url: "/shop/addtocart",
        contentType: 'application/json',
        data:JSON.stringify(dataToSend),
        success: function(data){
          // console.log(data);
            // alert("Added to cart");

            UIkit.notification({
              message: 'Added to Cart',
              status: 'success',
              pos: 'top-center',
              timeout: 5000
          });
          
        },
        error: function(err){
          if(err.status == 401){
            window.location.href="/login"
          }
          // console.log(err);
          console.log("Error adding item to cart");
        }
      });
}


$(document).ready(function(){
  // autocompleteSuggestion();
});