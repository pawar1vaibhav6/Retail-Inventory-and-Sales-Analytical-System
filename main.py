import Product_insertion as pi
import Customers as c

def main():
    print(
        "1.Add New Product\n"
          "2.Update Price of Existing Product\n"
          "3.Update Stock of Existing Product\n"
          "4.Add New Customers\n"
          "5.Exit"
          )
    try:
        options=int(input("Choose From above(1,2,3,4,5):"))
    except ValueError:
        print("Enter a valid number")
        return
    if options==1:
        pi.new_product()
    elif options==2:
        pi.price_increase()
    elif options==3:
        pi.stock_increase()
    elif options==4:
        c.new_customers()
    elif options==5:
        print("Thank you for visiting")
    else:
        print("Invalid Input")

if __name__=="__main__":
    main()


