#!/bin/bash


# switch to main
git checkout main 

# roll back to a specific commit (commit after autofactory action has been added)
git reset --hard a9672c6 

# Delete every other local branch (all except the current one)
git branch | grep -v '^\* ' | xargs -r git branch -D

# rewinds remote main to the initial commit
git push --force origin main 

# removes the remote branch (actually pushes the delete but meh)
git push origin --delete add-player-login 

# ads a file so that I can quickly check the local repo to know what state it's in :)
touch .reset_done 
