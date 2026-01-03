import Product as pi
import Customers as c
import Sales as s
import Analysis as a

def main():
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
        while True:
            total_amount=s.sale(customer_id,total_amount)
            user_input=input("Press q to exit")
            if user_input.lower()=="q":
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
            "1. Low Stock"
        )
        opt=int(input("Choose From above(1):"))
        if opt==1:
            a.low_stock()
    elif options==8:
        print("Thank you for visiting")
    else:
        print("Invalid Input")

if __name__=="__main__":
    main()


