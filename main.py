import Product as pi
import Customers as c
import Sales as s
import Analysis as a
import Charts as ch
import login as l


def main():
    role = None
    while role is None:
        role = l.login()
    
    admin_only = [2, 4, 5, 6, 7, 8]

    while True:
        
        print(
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
            )
        
        try:
            options=int(input("Choose from above(1-10):"))
        except ValueError:
            print("Invalid input. Please enter a number.")
            continue

        if options in admin_only and role != "admin":
            print("Access denied. Admin only.")
            continue
        
        if options==1:

            try:
                customer_id=int(input("Customer_id:"))
            except ValueError:
                print("Invalid input. Please enter a valid CustomerId.")
                continue

            total_amount=0
            bill_items=[]
            while True:
                total_amount,bill=s.sale(customer_id,total_amount,bill_items)
                if input("Add another item? (q to quit): ").lower() == "q":
                    break
            print(bill)
            print(f"Total Payable amount:{total_amount}")

        elif options==2:
            pi.new_product()

        elif options==3:
            try:
                pid=int(input("ProductId:"))
            except ValueError:
                print("Invalid input. Please enter a valid Product Id.")
                continue

            pi.check_product(pid)

        elif options==4:
            pi.price_increase()

        elif options==5:
            pi.stock_increase()

        elif options==6:
            c.new_customers()

        elif options==7:
            print(
                "1. Low Stock\n"
                "2. Month Wise Sale\n"
                "3. Daily Sales\n"
                "4. Weekly Sales\n"
                "5. Inventory Value\n"
                "6. Category Wise Sales\n"
                "7. Product Wise Sales"
            )

            try:
                opt=int(input("Choose from above(1-7):"))
            except ValueError:
                print("Invalid input. Please enter a valid number")
                continue
            
            if opt==1:
                a.low_stock()
            elif opt==2:
                try:
                    year=int(input("Enter the Year:"))
                except ValueError:
                    print("Enter a valid Year")
                    continue
                a.monthly_sale(year)
            elif opt==3:
                a.daily_sale()
            elif opt==4:
                try:
                    year=int(input("Enter the Year:"))
                except ValueError:
                    print("Enter a valid Year")
                    continue
                a.weekly_sale(year)
            elif opt==5:
                a.inventory_value()
            elif opt==6:
                a.category_sale()
            elif opt==7:
                a.product_sale()
            else:
                print("Invalid Input")
        
        elif options==8:
            
            print(
                "1. Monthly Sales\n"
                "2. Weekly Sales\n"
                "3. Daily Sales"
            )

            try:
                option=int(input("Choose from above(1-3):"))
            except ValueError:
                print("Invalid input. Please enter a valid number.")
                continue
            
            if option==1:
                try:
                    year=int(input("Enter the Year:"))
                except ValueError:
                    print("Enter a valid Year")
                    continue
                ch.monthly_sale(year)
            elif option==2:
                try:
                    year=int(input("Enter the Year:"))
                except ValueError:
                    print("Enter a valid Year")
                    continue
                ch.weekly_sale(year)
            elif option==3:
                try:
                    year=int(input("Enter the Year:"))
                except ValueError:
                    print("Enter a valid Year")
                    continue
                try:
                    month=int(input("Enter the Month:"))
                except ValueError:
                    print("Enter a valid Month")
                    continue
                ch.daily_sale(year,month)
            else:
                print("Invalid Input")
        
        elif options==9:
            print("Logged out successfully")
            break

        elif options==10:
            print("Thank you for visiting")
            break

        else:
            print("Invalid Input")
    

if __name__=="__main__":
    main()