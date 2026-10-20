from db import verify_user


def login():
    """Dynamic database-driven authentication for CLI."""
    for _ in range(3):
        username = input("Username: ").strip()
        if not username:
            print("Username cannot be empty")
            continue

        password = input("Password: ").strip()

        user = verify_user(username, password)
        if user:
            print(f"Welcome {user['username']} ({user['role'].capitalize()})")
            return user["role"]

        print("Invalid credentials")

    print("Access denied")
    return None
