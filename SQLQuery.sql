create table Products(product_id int primary key,p_name varchar(20),category varchar(20),price int,cost int,stock_quantity int);
create table Customers(customer_id int primary key,c_name varchar(20),email varchar(25) unique,region varchar (20));
create table Sales(sales_id int primary key identity,product_id int foreign key references products(product_id),customer_id int foreign key references Customers(customer_id),
				Date datetime,quantity int,total_amount int,gst_amount int);
create table stock(product_id int foreign key references products(product_id),Restock_date datetime,Added_stock int,total_cost int);
 