async function predictKPT(){

const data = {
restaurant_type: document.getElementById("restaurant_type").value,
items: document.getElementById("items").value,
density: document.getElementById("density").value,
pos_orders: document.getElementById("pos_orders").value,
activity: document.getElementById("activity").value
};

const response = await fetch("http://127.0.0.1:5000/predict",{

method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify(data)

});

const result = await response.json();

document.getElementById("result").innerHTML =
"Predicted Kitchen Prep Time: " + result.kpt + " minutes";

}