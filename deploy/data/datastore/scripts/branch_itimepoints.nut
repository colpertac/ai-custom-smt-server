function define(script)
{
    script.Name = "branch_iTimePoints";
    script.Type = "EventBranchLogic";
    return 0;
}

// Branch based on the character's I-Time points
// - params[0]: I-Time ID
// - params[1]: If "Y", the first index should be used if the NPC was
//   never spoken to
// - params[2]: If "Y", adjust offset based upon character gender
function check(source, cState, dState, zone, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    local progress = character ? character.GetProgress().Get() : null;
    if(character == null || progress == null || params.len() < 1)
    {
        return -1;
    }

    local handleFirst = params.len() >= 2 && params[1] == "Y";
    local genderOffset = params.len() >= 3 && params[2] == "Y" &&
        character.Gender == Character_Gender_t.FEMALE;

    if(!progress.ITimePointsKeyExists(params[0].tointeger()))
    {
        // Never spoken with
        if(handleFirst)
        {
            return genderOffset ? 6 : 0;
        }
        else
        {
            return -1;
        }
    }
    else
    {
        local offset = handleFirst ? 1 : 0;
        if(genderOffset)
        {
            offset += (handleFirst ? 6 : 5);
        }

        local points = progress.GetITimePointsByKey(params[0].tointeger());
        if(points <= 2000)
        {
            // Rank 1
            return 0 + offset;
        }
        else if(points <= 4000)
        {
            // Rank 2
            return 1 + offset;
        }
        else if(points <= 6000)
        {
            // Rank 3
            return 2 + offset;
        }
        else if(points <= 8000)
        {
            // Rank 4
            return 3 + offset;
        }
        else
        {
            // Rank 5
            return 4 + offset;
        }
    }
}