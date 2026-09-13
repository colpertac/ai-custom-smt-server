function define(script)
{
    script.Name = "branch_counterValue";
    script.Type = "EventBranchLogic";
    return 0;
}

// Branch based on the current value of the specified event counter
// - params[0]: event counter
function check(source, cState, dState, zone, params)
{
    if(cState == null || params.len() < 1)
    {
        return -1;
    }

    local counter = cState.GetEventCounter(params[0].tointeger(), false);
    if(counter != null)
    {
        return counter.GetCounter();
    }

    return -1;
}