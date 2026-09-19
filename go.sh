# Add a comment to mention that the shell script to start the server does so using the inbuilt python web server.
# This works, but it is ugly and is a "raw" http server. 
# This should be fixed in the future.
python -m http.server 8000 --bind 0.0.0.0
