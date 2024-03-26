#!/bin/sh

task_regex="^Task:\s"
commits=$(git log HEAD~4..HEAD --pretty=format:"%h") 

for variable in $commits
do
    message=$(git log "$variable^..$variable" --pretty=format:"%B")
    echo "message..."
    echo "$message\\n"
    echo "test..."
    if test $(echo "$message" | grep -e $task_regex | wc -l) -eq 0; then
        echo "Commit $variable missing \"Task:\" trailer"
        echo "Commit message:\\n$message"
        exit 1 ## 
    fi
done
exit 0