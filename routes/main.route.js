
const { response } = require("express");
const shopController = require("../controllers/main.controller");


module.exports = function(app){
    app.route("/shop/fetchProducts").get(shopController.fetchProduct);
    app.route("/shop/product/:key").get(shopController.fetchProductById);
    app.route("/shop/addtocart").post(sessionCheckerForAddToCart,shopController.addtocart);
    app.route("/shop/cart").get(sessionChecker,shopController.cart);
    app.route("/shop/deleteFromCart").post(sessionChecker,shopController.deleteFromCart);
    app.route("/shop/updatecart").post(sessionChecker,shopController.updateCart);
    app.route("/shop/orders").get(sessionChecker,shopController.order);
    app.route("/shop/placeOrder").post(sessionChecker,shopController.placeOrder);
    app.route("/shop/myorders").get(sessionChecker,shopController.myorders);
    app.route("/shop/orderplaced").get(sessionChecker,shopController.orderplaced);
    app.route("/shop/addreview").post(sessionChecker,shopController.addreview);
    app.route("/shop/productreview").post(shopController.getProductReviewById);
    app.route("/shop/getsuggestion/:keys").get(shopController.getSuggestion);

    app.route("/shop/filters").post(shopController.getFilterInfo);


    app.route("*/contact").get((req,res,next)=>{
        res.render("contact");
        res.end();
    });

    app.route("*/faq").get((req,res,next)=>{
        res.render("faq");
        res.end();
    });

    app.route("*/about").get((req,res,next)=>{
        res.render("about");
        res.end();
    });
}



var sessionChecker = (req, res, next) => {
    if (req.session.user && req.cookies.user_id) {
        next();
    } else {
        // let err = new Error("Not authorized");
        // err.status = 401;
        // return next(err);
        res.redirect("/login");
        
    }
};


var sessionCheckerForAddToCart = (req,res,next)=>{
    if (req.session.user && req.cookies.user_id) {
        next();
    } else {
        let err = new Error("Not authorized");
        err.status = 401;
        return next(err);
        // res.redirect("/login");
        
    }
}