function define(script)
{
    script.Name = "branch_gender";
    script.Type = "EventBranchLogic";
    return 0;
}

// Branch based on the character or parter demon's gender
// - params[0]: If specified and 1, check the demon's gender
function check(source, cState, dState, zone, params)
{
    if(params.len() > 0 && params[0].tointeger() == 1)
    {
        if(dState == null)
        {
            return -1;
        }

        local devilData = dState.GetDevilData();
        if(devilData == null)
        {
            return -1;
        }

        return devilData.GetBasic().Gender;
    }
    else
    {
        if(cState == null)
        {
            return -1;
        }

        local character = cState.GetEntity();
    
        return character.Gender == Character_Gender_t.MALE ? 0 : 1;
    }
}