function define(script)
{
    script.Name = "bool_counterValue";
    script.Type = "EventCondition";
    return 0;
}

// Check the current value of the specified event counter
// - value1: event counter
// - value2: value
// - params[0]: GTE value check if 0, flag check if 1
function check(source, cState, dState, zone, value1, value2, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    if(character != null)
    {
        if(value1 != 0)
        {
            local counter = cState.GetEventCounter(value1, false);
            if(counter != null)
            {
                if(params.len() == 1 && params[0].tointeger() == 1)
                {
                    // Flag check
                    return (value2 >= 0 && (counter.GetCounter() & (1 << value2)) != 0) ? 0 : -1;
                }
                else
                {
                    return counter.GetCounter() >= value2 ? 0 : -1;
                }
            }
        }    
    }

    return (params.len() == 0 || params[0].tointeger() != 1) && value2 <= 0 ? 0 : -1;
}