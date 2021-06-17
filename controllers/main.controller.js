const e = require("express");
const dbService = require("../services/database.service");



exports.fetchProduct = function(req,res,next){
    let searchQuery =null;
    let ratingFilter = null;
    let queryObject = {};
    let brand = '';
    let priceMax = 500;
    let priceMin = 0;
    if(req.query.searchQuery != null && req.query.searchQuery != undefined && req.query.searchQuery.length>0){
        searchQuery = req.query.searchQuery;
        let temp = req.query.searchQuery.replace(/\[/g,'').replace(/\]/g,'').replace(/\(/g,'').replace(/\)/g,'').replace(/-/g,' ');
        queryObject.NAME ={$contains: "fuzzy(("+temp+"))"}
    }
    // if(req.query.ratingFilter != null && req.query.ratingFilter != undefined && req.query.ratingFilter.length>0){
    //     queryObject.CUSTOMERREVIEWAVERAGE = {$gte:req.query.ratingFilter};
    // }

    if(req.query.brand != null && req.query.brand != undefined && req.query.brand.length>0){
        brand = req.query.brand;
        let arr = req.query.brand.split(',');
        queryObject.MANUFACTURER = {$in:arr};
    }

    if(req.query.priceMin != null && req.query.priceMin != undefined && req.query.priceMin.length>0){
       
        priceMax = req.query.priceMax;
        priceMin = req.query.priceMin;

        queryObject.SALEPRICE = {$gt:priceMin,$lt: priceMax};

    }
    let pageNumber = 1;
    let totalPageCount = 0;
    let actualCount =0;
    if(req.query.page != undefined && req.query.page != null){
        let temp =  parseInt(req.query.page);
        if(!isNaN(temp)){
            pageNumber = temp;
        }
    }
    let startRow = 13*(pageNumber-1);
    dbService.returnProducts(startRow,queryObject)
    .then(
        data=>{

            actualCount = data.count;
            totalPageCount = Math.ceil(actualCount/13);
            res.render('products',{products:data.list,totalCount:actualCount,currentPage:pageNumber,noOfPages:totalPageCount,query:searchQuery,ratingFilter:ratingFilter,brand:brand,priceMin:priceMin,priceMax:priceMax});
            res.end();
        },
        err=>{
            return next(err);
        }
    )
}






exports.getFilterInfo = function(req,res,next){

    let searchQuery =null;
    let queryObject = {};
    if(req.body.searchQuery != null && req.body.searchQuery != undefined && req.body.searchQuery.length>0){
        searchQuery = req.body.searchQuery;
        let temp = searchQuery.replace(/\[/g,'').replace(/\]/g,'').replace(/\(/g,'').replace(/\)/g,'').replace(/-/g,' ');
        queryObject.NAME = temp;
    }
    
    // if(req.query.ratingFilter != null && req.query.ratingFilter != undefined && req.query.ratingFilter.length>0){
    //     queryObject.CUSTOMERREVIEWAVERAGE = {$gte:req.query.ratingFilter};
    // }

    dbService.getBrandsAndCount(queryObject,null)
    .then(
        (data)=>{
            res.send(data);
            res.end();  
        },
        (err)=>{
            return next(err);
        }
    )
    
}


exports.fetchProductById = function(req,res,next){
    let item = req.params.key;
    dbService.getProductByKey(item)
    .then(
        (data)=>{
            res.render('productInfo',{product:data});
            res.end();
        },
        err=>{
            return next(err);
        }
    )

}

exports.getProductReviewById = function(req,res,next){
    let queryObject = {};
    let pageNumber = 0;
    if(req.body.key)queryObject.PRODUCT_ID = req.body.key;
    if(req.body.pageNumber) pageNumber = req.body.pageNumber;
    if(req.body.keys != null && req.body.keys != undefined && req.body.keys.length>0){
        queryObject.REVIEW ={$contains: "fuzzy(("+req.body.keys+"))"}
    }
    if(req.body.filteroption != null && req.body.filteroption != undefined){
        let intValue = parseInt(req.body.filteroption);
        queryObject.RATING = {$gte:intValue,$lt:intValue+1};
    }

    dbService.getProductReviewByProductId(queryObject,pageNumber,null)
    .then(
        (data)=>{
            res.send(data);
            res.end();
        },
        (err)=>{
            return next(err);
        }

    )
}


/**
 * The method below "getSuggestion" fetches the suggestions for user
 * for keywords they enter
 */

exports.getSuggestion = function(req,res,next){
    let keywords = req.params.keys;
    dbService.getSuggestion(keywords)
    .then(
        (data)=>{
            res.send(data);
            res.end();
        },(err)=>{
            res.send([]);
            res.end();
        }
    )


}

exports.addtocart = function(req,res,next){
    let productKey = req.body.key;
    let user_id = req.session.user;
    dbService.addProductToCart(productKey,user_id)
    .then(
        (data)=>{
            res.send(data);
            res.end();
        },
        (err)=>{
            return next(err);
        }
    )
    
    
}


exports.cart = function(req,res,next){
    // let user_id = 26;
    let user_id = req.session.user;
    dbService.getCartDetails(user_id)
    .then(
        (data)=>{
            res.render("cart",{carts:data});
            res.end();
        },
        (err)=>{
            let error = new Error("Error fetching cart");
            return next(error);
        }
    )
}

exports.deleteFromCart= function(req,res,next){
    let user_id = req.session.user;
    let productKey = req.body.key;
    dbService.deleteProductFromCart(productKey,user_id)
    .then(
        (data)=>{
            res.send(true);
            res.end();
        },
        (err)=>{
            return next(err);
        }
    )
}

exports.updateCart = function(req,res,next){
    let user_id = req.session.user;
    let productKey = req.body.key;
    let quantity = req.body.count;
    dbService.updateCart(productKey,user_id,quantity)
    .then(
        (data)=>{
            res.send(true);
            res.end();
        },
        (err)=>{
            return next(err);
        }
    )
}

exports.order = function(req,res,next){
    let user_id = req.session.user;
    dbService.getCartDetails(user_id)
    .then(
        (data)=>{
            let datashop = data;
            if(datashop.length < 1){
                res.redirect("/shop/cart");
                res.end();
            }
            dbService.getUserInfo(user_id)
            .then(
                (userinfo)=>{
                    res.render("orders",{carts:datashop,user:userinfo});
                    res.end();
                },
                (err)=>{
                    return next(err);
                }
            )
           
        },
        (err)=>{
            let error = new Error("Error fetching cart");
            return next(error);
        }
    )
}


exports.placeOrder = function(req,res,next){
    let user_id = req.session.user;
    var address = req.body;
    dbService.placeOrder(address,user_id)
    .then(
        (data)=>{
            res.send(true);
            res.end();
        },
        (err)=>{
            return next(err);
        }

    )

}

exports.myorders = function(req,res,next){
    let user_id = req.session.user;
    dbService.myorders(user_id)
    .then(
        (data)=>{
            res.render('myOrders',{myorders:data});
            res.end();
        },
        (err)=>{
            return next(err);
        }
    )

}

exports.orderplaced = function(req,res,next){
    let user_id = req.session.user;
    dbService.myorders(user_id,null,'false')
    .then(
        (data)=>{
            res.render('orderplaced',{myorders:data});
            res.end();
        },
        (err)=>{
            return next(err);
        }
    )

}

exports.addreview = function(req,res,next){
    let user_id = req.session.user;
    let title = req.body.title;
    let review = req.body.review;
    let product_id = req.body.product_id;
    let order_id = req.body.orderid;
    // let order_id = null;
    let rating = req.body.rating || 0;
    dbService.addreview(user_id,product_id,review,title,order_id,rating)
    .then(
        (data)=>{
            res.send(true);
            res.end();
        },
        (err)=>{
            return next(err);
        }
    )


}