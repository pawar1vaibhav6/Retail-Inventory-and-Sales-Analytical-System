import Product as pi
import Customers as c

def main():
    print(
        "1.Add New Product\n"
        "2.Check For Product\n"
          "3.Update Price of Existing Product\n"
          "4.Update Stock of Existing Product\n"
          "5.Add New Customers\n"
          "6.Exit"
          )
    try:
        options=int(input("Choose From above(1,2,3,4,5):"))
    except ValueError:
        print("Enter a valid number")
        return
    if options==1:
        pi.new_product()
    elif options==2:
        id=int(input("Id:"))
        pi.check_product(id)
    elif options==3:
        pi.price_increase()
    elif options==4:
        pi.stock_increase()
    elif options==5:
        c.new_customers()
    elif options==6:
        print("Thank you for visiting")
    else:
        print("Invalid Input")

if __name__=="__main__":
    main()


