def login():
    users = {
        "admin": {"password": "admin@123", "role": "admin"},
        "cashier": {"password": "cashier@123", "role": "cashier"}
    }

    for _ in range(3):
        username = input("Username: ")

        if username not in users:
            print("User does not exist")
            continue

        password = input("Password: ")

        if password == users[username]["password"]:
            print(f"Welcome {username}")
            return users[username]["role"]

        print("Invalid credentials")

    print("Access denied")
    return None

