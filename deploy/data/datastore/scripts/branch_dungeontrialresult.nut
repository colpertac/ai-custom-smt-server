function define(script)
{
    script.Name = "branch_dungeonTrialResult";
    script.Type = "EventBranchLogic";
    return 0;
}

// Branch based the following 4 possible current time trial results:
// 1) No report available
// 2) First run
// 3) New record
// 4) Anything else
function check(source, cState, dState, zone, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    local progress = character != null ? character.GetProgress().Get() : null;
    if(progress != null)
    {
        local timeTrialID = progress.GetTimeTrialID();
        if(timeTrialID > 0)
        {
            local previousRecord = progress.GetTimeTrialRecordsByIndex(timeTrialID - 1);
            if(previousRecord == 0)
            {
                // First run
                return 1;
            }
            else if(previousRecord > progress.GetTimeTrialTime())
            {
                // New record
                return 2;
            }
            else
            {
                return -1;
            }
        }
    }

    // No report
    return 0;
}