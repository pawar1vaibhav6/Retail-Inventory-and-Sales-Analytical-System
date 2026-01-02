create table Products(product_id int primary key,p_name varchar(20),category varchar(20),price int,stock_quantity int);
create table Customers(customer_id int primary key,c_name varchar(20),email varchar(25),region varchar);
create table Sales(sales_id int primary key,product_id int foreign key references products(product_id),customer_id int foreign key references Customers(customer_id),
				Date date,quantity int,total_amount int);