import argparse
import os
import secrets


def main():
    parser = argparse.ArgumentParser(description="StageDoer server")
    parser.add_argument(
        "--public",
        action="store_true",
        help="Bind to 0.0.0.0 for public access",
    )
    args = parser.parse_args()

    host = "0.0.0.0" if args.public else "127.0.0.1"
    token = secrets.token_hex(8)

    # Set BEFORE uvicorn.run so the reloader child process inherits it
    os.environ["STAGEDOER_TOKEN"] = token

    display_host = "localhost" if not args.public else "0.0.0.0"
    print()
    print("=" * 60)
    print("  StageDoer")
    print(f"  URL: http://{display_host}:8000/?token={token}")
    print("=" * 60)
    print()

    import uvicorn
    uvicorn.run("app.main:app", host=host, port=8000, reload=True)


if __name__ == "__main__":
    main()
