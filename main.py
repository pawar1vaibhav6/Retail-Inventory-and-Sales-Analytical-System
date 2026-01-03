import Product as pi
import Customers as c
import Sales as s
import Analysis as a


def main():
    while True:
        print(
            "1. Purchase\n"
            "2. Add New Product\n"
            "3. Check For Product\n"
            "4. Update Price of Existing Product\n"
            "5. Update Stock of Existing Product\n"
            "6. Add New Customers\n"
            "7. Analysis\n"
            "8. Exit"
            )
        try:
            options=int(input("Choose From above(1,2,3,4,5,6,7,8):"))
        except ValueError:
            print("Enter a valid number")
            return
        if options==1:
            customer_id=int(input("Customer_id:"))
            total_amount=0
            bill_items=[]
            while True:
                total_amount,bill=s.sale(customer_id,total_amount,bill_items)
                user_input=input("Press q to exit")
                if user_input.lower()=="q":
                    print(bill)
                    print(f"Total Payable amount:{total_amount}")
                    break
                else:
                    continue
        elif options==2:
            pi.new_product()
        elif options==3:
            id=int(input("Id:"))
            pi.check_product(id)
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
                "4. Weekly Sales"
            )
            opt=int(input("Choose From above(1,2):"))
            if opt==1:
                a.low_stock()
            elif opt==2:
                a.monthly_sale()
            elif opt==3:
                a.daily_sale()
            elif opt==4:
                a.weekly_sale()
        elif options==8:
            print("Thank you for visiting")
            break
        else:
            print("Invalid Input")
    

if __name__=="__main__":
    main()