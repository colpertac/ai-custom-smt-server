function define(script)
{
    script.Name = "bool_player";
    script.Type = "EventCondition";
    return 0;
}

// Check if the current character is the target source entity
// - value1: If 1, current demon is valid as well
function check(source, cState, dState, zone, value1, value2, params)
{
    if(source != null && 
        ((cState != null && source.GetEntityID() == cState.GetEntityID()) ||
        (value1 == 1 && dState != null && source.GetEntityID() == dState.GetEntityID())))
    {
        return 0;
    }

    return -1;
}