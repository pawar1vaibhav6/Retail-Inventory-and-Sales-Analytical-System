import Product as pi
import Customers as c
import Sales as s
import Analysis as a
import Charts as ch
import login as l


def main():
    while True:
        role = None
        while role is None:
            role = l.login()
        
        admin_only = [2, 4, 5, 6, 7, 8]

        while True:
            
            print(
                "\033[36m"
                "1. Purchase\n"
                "2. Add New Product\n"
                "3. Check For Product\n"
                "4. Update Price of Existing Product\n"
                "5. Update Stock of Existing Product\n"
                "6. Add New Customers\n"
                "7. Analysis\n"
                "8. Charts\n"
                "9. Log Out\n"
                "10. Exit"
                "\033[0m"
                )
            
            try:
                options=int(input("Choose from above(1-10):"))
            except ValueError:
                print("\033[31mInvalid input. Please enter a number.\033[0m")
                continue

            if options in admin_only and role != "admin":
                print("\033[31mAccess denied. Admin only.\033[0m")
                continue
            
            if options==1:

                try:
                    customer_id=int(input("Customer_id:"))
                except ValueError:
                    print("\033[31mInvalid input. Please enter a valid CustomerId.\033[0m")
                    continue

                total_amount=0
                bill_items=[]
                while True:
                    total_amount,bill,s_id,s_date=s.sale(customer_id,total_amount,bill_items)
                    if input("Add another item? (q to quit): ").lower() == "q":
                        break
                s.bill_format(s_id,s_date,customer_id,bill,total_amount)

            elif options==2:
                pi.new_product()

            elif options==3:
                print(
                    "1. Product Id\n"
                    "2. Product Name\n"
                    "3. Category"
                )
                try:
                    p=int(input("Choose from (1-3):"))
                except ValueError:
                    print("\033[31mInvalid input. Please enter a valid number.\033[0m")
                    continue

                if p==1:
                    try:
                        product_id=int(input("ProductId:"))
                    except ValueError:
                        print("\033[31mInvalid input. Please enter a valid Product Id.\033[0m")
                        continue
                    pi.check_product("product_id",product_id)

                elif p==2:
                    p_name=input("Enter Product Name:")
                    pi.check_product("p_name",p_name)

                elif p==3:
                    category=input("Enter Product Category:")
                    pi.check_product("category",category)
                

            elif options==4:
                pi.price_increase()

            elif options==5:
                pi.stock_increase()

            elif options==6:
                c.new_customers()

            elif options==7:
                print(
                    "\033[36m"
                    "1. Low Stock\n"
                    "2. Month Wise Sale\n"
                    "3. Daily Sales\n"
                    "4. Weekly Sales\n"
                    "5. Inventory Value\n"
                    "6. Category Wise Sales\n"
                    "7. Product Wise Sales\n"
                    "8. Monthly Gst Collection"
                    "\033[0m"
                )

                try:
                    opt=int(input("Choose from above(1-8):"))
                except ValueError:
                    print("\033[31mInvalid input. Please enter a valid number.\033[0m")
                    continue
                
                if opt==1:
                    a.low_stock()
                elif opt==2:
                    try:
                        year=int(input("Enter the Year:"))
                    except ValueError:
                        print("\033[31mEnter a valid Year.\033[0m")
                        continue
                    a.monthly_sale(year)
                elif opt==3:
                    a.daily_sale()
                elif opt==4:
                    try:
                        year=int(input("Enter the Year:"))
                    except ValueError:
                        print("\033[31mEnter a valid Year\033[0m")
                        continue
                    a.weekly_sale(year)
                elif opt==5:
                    a.inventory_value()
                elif opt==6:
                    a.category_sale()
                elif opt==7:
                    a.product_sale()
                elif opt==8:
                    try:
                        year=int(input("Enter the Year:"))
                    except ValueError:
                        print("\033[31mEnter a valid Year\033[0m")
                        continue
                    a.monthly_gst(year)
                else:
                    print("\033[31mInvalid Input\033[0m")
            
            elif options==8:
                
                print(
                    "\033[36m"
                    "1. Monthly Sales\n"
                    "2. Weekly Sales\n"
                    "3. Daily Sales\n"
                    "4. Monthly Profit"
                    "\033[0m"
                )

                try:
                    option=int(input("Choose from above(1-4):"))
                except ValueError:
                    print("\033[31mInvalid input. Please enter a valid number.\033[0m")
                    continue
                
                if option==1:
                    try:
                        year=int(input("Enter the Year:"))
                    except ValueError:
                        print("\033[31mEnter a valid Year\033[0m")
                        continue
                    ch.monthly_sale(year)
                elif option==2:
                    try:
                        year=int(input("Enter the Year:"))
                    except ValueError:
                        print("\033[31mEnter a valid Year\033[0m")
                        continue
                    ch.weekly_sale(year)
                elif option==3:
                    try:
                        year=int(input("Enter the Year:"))
                    except ValueError:
                        print("\033[31mEnter a valid Year\033[0m")
                        continue
                    try:
                        month=int(input("Enter the Month:"))
                    except ValueError:
                        print("\033[31mEnter a valid Month\033[0m")
                        continue
                    ch.daily_sale(year,month)
                elif option==4:
                    try:
                        year=int(input("Enter the Year:"))
                    except ValueError:
                        print("\033[31mEnter a valid Year\033[0m")
                        continue
                    ch.profit(year)
                else:
                    print("\033[31mInvalid Input\033[0m")
            
            elif options==9:
                print("\033[1;32mLogged out successfully\033[0m")
                break

            elif options==10:
                print("\033[35mThank you for visiting\033[0m")
                return

            else:
                print("\033[31mInvalid Input\033[0m")
    

if __name__=="__main__":
    main()