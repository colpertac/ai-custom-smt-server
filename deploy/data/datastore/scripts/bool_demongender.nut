function define(script)
{
    script.Name = "bool_demonGender";
    script.Type = "EventCondition";
    return 0;
}

// Check if a demon matches a certain gender.
// - value1: Gender (0 = male, 1 = female)
function check(source, cState, dState, zone, value1, value2, params)
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
    if(devilData.GetBasic().Gender == value1)
    {
        return 0;
    }

    return -1;
}