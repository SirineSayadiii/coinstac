import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { compose } from 'redux';
import { graphql, withApollo } from 'react-apollo';
import { DragDropContext, DropTarget } from 'react-dnd';
import HTML5Backend from 'react-dnd-html5-backend';
import NumberFormat from 'react-number-format';
import shortid from 'shortid';
import { isEqual, isEmpty, get, omit } from 'lodash';
import update from 'immutability-helper';
import {
  Button,
  Checkbox,
  FormControlLabel,
  Menu,
  MenuItem,
  Paper,
  Typography,
} from '@material-ui/core';
import { withStyles } from '@material-ui/core/styles';
import { ValidatorForm, TextValidator } from 'react-material-ui-form-validator';
import ListDeleteModal from '../common/list-delete-modal';
import StatusButtonWrapper from '../common/status-button-wrapper';
import PipelineStep from './pipeline-step';
import ItemTypes from './pipeline-item-types';
import {
  FETCH_ALL_CONSORTIA_QUERY,
  FETCH_PIPELINE_QUERY,
  SAVE_PIPELINE_MUTATION,
  SAVE_ACTIVE_PIPELINE_MUTATION,
} from '../../state/graphql/functions';
import {
  getDocumentByParam,
  saveDocumentProp,
  consortiumSaveActivePipelineProp,
} from '../../state/graphql/props';
import { notifySuccess, notifyError } from '../../state/ducks/notifyAndLog';
import { isPipelineOwner } from '../../utils/helpers';

const computationTarget = {
  drop() {
  },
};

const collect = (connect, monitor) => (
  {
    connectDropTarget: connect.dropTarget(),
    isOver: monitor.isOver(),
  }
);

const styles = theme => ({
  title: {
    marginBottom: theme.spacing.unit * 2,
  },
  formControl: {
    marginBottom: theme.spacing.unit * 2,
  },
  owningConsortiumButtonTitle: {
    marginBottom: theme.spacing.unit,
  },
  savePipelineButtonContainer: {
    textAlign: 'right',
    marginBottom: theme.spacing.unit * 2,
  },
  tooltipPaper: {
    ...theme.mixins.gutters(),
    paddingTop: theme.spacing.unit * 2,
    paddingBottom: theme.spacing.unit * 2,
    marginBottom: theme.spacing.unit * 2,
    backgroundColor: '#fef7e4',
    textAlign: 'center',
  },
  tooltip: {
    color: '#ab8e6b',
  },
});

const NumberFormatCustom = ({ inputRef, onChange, ...other }) => (
  <NumberFormat
    getInputRef={inputRef}
    onValueChange={(values) =>
      onChange({
        target: {
          value: values.value,
        },
      })
    }
    isNumericString
    suffix=" minutes"
    {...other}
  />
);

class Pipeline extends Component {
  constructor(props) {
    super(props);

    let consortium = null;
    let pipeline = {
      name: '',
      description: '',
      timeout: null,
      owningConsortium: '',
      shared: false,
      steps: [],
      delete: false,
    };

    // if routed from New Pipeline button on consortium page

    const { consortiumId, runId } = props.params;

    if (consortiumId) {
      const data = props.client.readQuery({ query: FETCH_ALL_CONSORTIA_QUERY });
      consortium = data.fetchAllConsortia.find(cons => cons.id === consortiumId);
      pipeline.owningConsortium = consortium.id;
    }

    if (runId) {
      const { runs } = props;
      runs.filter(run => run.id === runId);
      pipeline = get(runs, '0.pipelineSnapshot');
    }

    this.state = {
      consortium,
      owner: true,
      pipeline,
      selectedId: pipeline.steps.length ? pipeline.steps[0].id : null,
      startingPipeline: pipeline,
      openOwningConsortiumMenu: false,
      openAddComputationStepMenu: false,
      showModal: false,
      savingStatus: 'init',
    };
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (isEmpty(this.state.consortium) && nextProps.consortia.length
      && this.state.pipeline.id && this.state.pipeline.owningConsortium) {
      this.setConsortium();
    }

    let selectedId = null;
    if (this.state.selectedId) {
      selectedId = this.state.selectedId;
    } else if (nextProps.activePipeline && nextProps.activePipeline.steps.length) {
      selectedId = nextProps.activePipeline.steps[0].id;
    }

    if (nextProps.activePipeline && !this.state.pipeline.id) {
      const { activePipeline: { __typename, ...other } } = nextProps;
      this.setState(
        { pipeline: { ...other }, selectedId, startingPipeline: { ...other } },
        () => {
          if (nextProps.consortia.length && this.state.pipeline.owningConsortium) {
            this.setConsortium();
          }
        }
      );
    }
  }

  setConsortium = () => {
    const { auth: { user }, client, params } = this.props;
    const { pipeline } = this.state;
    const { owningConsortium } = pipeline;

    const owner = params.runId ? false : isPipelineOwner(user.permissions, owningConsortium);

    const data = client.readQuery({ query: FETCH_ALL_CONSORTIA_QUERY });
    const consortium = data.fetchAllConsortia.find(cons => cons.id === owningConsortium);

    if (consortium) {
      delete consortium.__typename;
    }

    this.setState(prevState => ({
      owner,
      consortium,
      pipeline: { ...prevState.pipeline, owningConsortium },
      startingPipeline: { ...prevState.pipeline, owningConsortium },
    }));
  }

  addStep = computation => {
    const controllerType = computation.computation.remote ? 'decentralized' : 'local';

    const id = shortid.generate();

    this.accordionSelect(id);

    this.setState(prevState => ({
      openAddComputationStepMenu: false,
      pipeline: {
        ...prevState.pipeline,
        steps: [
          ...prevState.pipeline.steps,
          {
            id,
            controller: { type: controllerType, options: {} },
            computations: [
              { ...computation },
            ],
            inputMap: {},
          },
        ],
      },
    }));
    // () => this.updateStorePipeline());
  }

  accordionSelect = selectedId => {
    this.setState({ selectedId });
  }

  moveStep = (id, swapId) => {
    const { steps } = this.state.pipeline;

    const movedStepIndex = steps.findIndex(step => step.id === id);
    const movedStep = steps[movedStepIndex];

    const index = steps.findIndex(step => step.id === (swapId || id));

    // Remap inputMap props to new indices if required
    const newArr = steps
      .map((step, stepIndex) => {
        let inputMap = { ...step.inputMap };

        inputMap = Object.assign({},
          ...Object.keys(inputMap).map((key) => {
            if (key !== 'covariates' && 'fromCache' in inputMap[key]) {
              const cacheStep = inputMap[key].fromCache.step;
              const variable = inputMap[key].fromCache.variable;
              const label = inputMap[key].fromCache.label;

              if (index >= stepIndex && movedStepIndex < stepIndex) {
                return { [key]: {} };
              } else if (movedStepIndex === cacheStep) {
                return { [key]: { fromCache: { step: index, variable, label } } };
              } else if (index <= cacheStep && movedStepIndex > cacheStep) {
                return {
                  [key]: { fromCache: { step: cacheStep + 1, variable, label } },
                };
              } else if (movedStepIndex < cacheStep && index >= cacheStep && index < stepIndex) {
                return {
                  [key]: { fromCache: { step: cacheStep - 1, variable, label } },
                };
              }
            }

            return { [key]: inputMap[key] };
          })
        );

        if ('covariates' in inputMap && 'ownerMappings' in inputMap.covariates && inputMap.covariates.ownerMappings.length) {
          let covariateMappings = [...inputMap.covariates.ownerMappings];

          covariateMappings = inputMap.covariates.ownerMappings
            .filter(cov => cov.fromCache)
            .map((cov) => {
              if (index >= stepIndex && movedStepIndex < stepIndex) {
                return {};
              } else if (movedStepIndex === cov.fromCache.step) {
                return { fromCache: { ...cov.fromCache, step: index } };
              } else if (index <= cov.fromCache.step && movedStepIndex > cov.fromCache.step) {
                return { fromCache: { ...cov.fromCache, step: cov.fromCache.step + 1 } };
              } else if (movedStepIndex < cov.fromCache.step && index >= cov.fromCache.step && index < stepIndex) {
                return { fromCache: { ...cov.fromCache, step: cov.fromCache.step - 1 } };
              }

              return cov;
            });

          inputMap = {
            ...inputMap,
            covariates: {
              ownerMappings: covariateMappings,
            },
          };
        }

        return {
          ...step,
          inputMap,
        };
      })
      .filter(step => step.id !== id);

    newArr.splice(index, 0, {
      ...movedStep,
      inputMap: Object.assign(
        {},
        ...Object.keys(movedStep.inputMap).map((key) => {
          if (key !== 'covariates' && 'fromCache' in movedStep.inputMap[key] &&
            movedStep.inputMap[key].step >= index) {
            return { [key]: {} };
          } else if (key === 'covariates' && 'ownerMappings' in movedStep.inputMap.covariates && movedStep.inputMap.covariates.ownerMappings.length) {
            return {
              [key]: movedStep.inputMap[key].ownerMappings
                .filter(cov => cov.fromCache)
                .map((cov) => {
                  if (cov.fromCache.step >= index) {
                    return {};
                  }

                  return cov;
                }),
            };
          }

          return { [key]: { ...movedStep.inputMap[key] } };
        })
      ),
    });

    this.setState(prevState => ({
      pipeline: {
        ...prevState.pipeline,
        steps: newArr,
      },
    }));
    // () => this.updateStorePipeline());
  }

  updateStorePipeline = () => {
    const { client } = this.props;
    const { pipeline } = this.state;

    const data = client.readQuery({ query: FETCH_ALL_CONSORTIA_QUERY });
    data.fetchPipeline = { ...pipeline, __typename: 'Pipeline' };

    client.writeQuery({ query: FETCH_PIPELINE_QUERY, data });
  }

  updateStep = (step) => {
    this.setState(prevState => ({
      pipeline: {
        ...prevState.pipeline,
        steps: update(prevState.pipeline.steps, {
          $splice: [[prevState.pipeline.steps.findIndex(s => s.id === step.id), 1, step]],
        }),
      },
    }));
  }

  deleteStep = () => {
    this.setState(prevState => ({
      pipeline: {
        ...prevState.pipeline,
        steps: update(prevState.pipeline.steps, {
          $splice: [[prevState.pipeline.steps.findIndex(s => s.id === prevState.stepToDelete), 1]],
        }),
      },
    }),
    () => this.updateStorePipeline());
    this.closeModal();
  }

  closeModal = () => {
    this.setState({ showModal: false });
  }

  openModal = stepId => {
    this.setState({
      showModal: true,
      stepToDelete: stepId,
    });
  }

  updatePipeline = payload => {
    const { param, value, consortiumName } = payload;

    if (param === 'owningConsortium') {
      this.setState({
        openOwningConsortiumMenu: false,
        consortium: { id: value, name: consortiumName },
      });
    }

    this.setState(prevState => ({
      pipeline: { ...prevState.pipeline, [param]: value },
    }));
    // this.updateStorePipeline());
  }

  checkPipeline = () => {
    const { startingPipeline, pipeline } = this.state;
    return isEqual(startingPipeline, pipeline);
  }

  savePipeline = async () => {
    const { auth: { user } } = this.props;

    const isActive = get(this.state.pipeline, 'isActive', false);

    const pipeline = omit(this.state.pipeline, ['isActive']);

    this.setState({ savingStatus: 'pending' });

    try {
      const { data } = await this.props.savePipeline({
        ...pipeline,
        steps: pipeline.steps.map(step => ({
          id: step.id,
          computations: step.computations.map(comp => comp.id),
          inputMap: {
            ...step.inputMap,
            meta: {
              ...step.inputMap.meta,
              owner: user.id,
            },
          },
          dataMeta: step.dataMeta,
          controller: {
            id: step.controller.id,
            type: step.controller.type,
            options: step.controller.options,
          },
        })),
      });

      const { savePipeline: { __typename, ...other } } = data
      const newPipeline = { ...this.state.pipeline, ...other };

      this.setState({
        pipeline: newPipeline,
        startingPipeline: newPipeline,
        savingStatus: 'success',
      });

      this.props.notifySuccess({ message: 'Pipeline Saved.' });

      if (isActive) {
        const { savePipeline } = data;
        await this.props.saveActivePipeline(savePipeline.owningConsortium, savePipeline.id);
      }
    } catch ({ graphQLErrors }) {
      this.props.notifyError({ message: get(graphQLErrors, '0.message', 'Failed to save pipeline') });

      this.setState({ savingStatus: 'fail' });
    }
  }

  openOwningConsortiumMenu = (event) => {
    this.owningConsortiumButtonElement = event.currentTarget;
    this.setState({ openOwningConsortiumMenu: true });
  }

  closeOwningConsortiumMenu = () => {
    this.setState({ openOwningConsortiumMenu: false });
  }

  openAddComputationStepMenu = event => {
    this.addComputationStepButtonElement = event.currentTarget;
    this.setState({ openAddComputationStepMenu: true });
  }

  closeAddComputationStepMenu = () => {
    this.setState({ openAddComputationStepMenu: false });
  }

  sortComputations = computations => {
    if(computations && computations.length > 0){
      return computations.slice().sort(function(a, b) {
        const nameA = a.meta.name.toLowerCase();
        const nameB = b.meta.name.toLowerCase();
        return (nameA < nameB) ? -1 : (nameA > nameB) ? 1 : 0;
      });
    }
  }

  render() {
    const { computations, connectDropTarget, consortia, classes, auth } = this.props;
    const {
      consortium,
      pipeline,
      owner,
      openOwningConsortiumMenu,
      openAddComputationStepMenu,
      showModal,
      savingStatus,
    } = this.state;

    const isEditing = !!pipeline.id;
    const title = isEditing ? 'Pipeline Edit' : 'Pipeline Creation';

    const sortedComputations = this.sortComputations(computations);

    return connectDropTarget(
      <div>
        <div className="page-header">
          <Typography variant="h4" className={classes.title}>
            {title}
          </Typography>
        </div>
        <ValidatorForm instantValidate noValidate onSubmit={this.savePipeline}>
          <TextValidator
            id="name"
            label="Name"
            fullWidth
            required
            disabled={!owner}
            value={pipeline.name || ''}
            name="name"
            validators={['required']}
            errorMessages={['Name is required']}
            withRequiredValidator
            onChange={evt => this.updatePipeline({ param: 'name', value: evt.target.value })}
            className={classes.formControl}
          />
          <TextValidator
            id="description"
            label="Description"
            multiline
            fullWidth
            required
            disabled={!owner}
            value={pipeline.description || ''}
            name="description"
            validators={['required']}
            errorMessages={['Description is required']}
            withRequiredValidator
            onChange={evt => this.updatePipeline({ param: 'description', value: evt.target.value })}
            className={classes.formControl}
          />
          <TextValidator
            id="timeout"
            label="Timeout"
            fullWidth
            disabled={!owner}
            value={pipeline.timeout}
            name="timeout"
            validators={['minNumber: 0', 'matchRegexp:[0-9]*']}
            errorMessages={['Timeout must be positive']}
            onChange={evt => this.updatePipeline({ param: 'timeout', value: evt.target.value })}
            className={classes.formControl}
            InputProps={{
              inputComponent: NumberFormatCustom,
            }}
          />
          {!isEditing && (
            <FormControlLabel
              control={(
                <Checkbox
                  checked={pipeline.setActive}
                  disabled={!owner}
                  onChange={evt => this.updatePipeline({ param: 'isActive', value: evt.target.checked })}
                />
              )}
              label="Set active on this consortium"
              className={classes.formControl}
            />
          )}
          <div className={classes.formControl}>
            <Typography variant="title" className={classes.owningConsortiumButtonTitle}>Owning Consortium</Typography>
            <Button
              id="pipelineconsortia"
              variant="contained"
              color="primary"
              disabled={!owner}
              onClick={this.openOwningConsortiumMenu}
            >
              {get(consortium, 'name', 'Consortia')}
            </Button>
            <Menu
              id="consortium-menu"
              anchorEl={this.owningConsortiumButtonElement}
              open={openOwningConsortiumMenu}
              onClose={this.closeOwningConsortiumMenu}
            >
              {consortia && consortia
                .filter(cons => cons.owners.includes(auth.user.id))
                .map(cons => (
                  <MenuItem
                    key={cons.id}
                    onClick={() => this.updatePipeline({
                      param: 'owningConsortium',
                      value: cons.id,
                      consortiumName: cons.name,
                    })
                    }
                  >
                    {cons.name}
                  </MenuItem>
                ))
              }
            </Menu>
          </div>
          <div className={classes.savePipelineButtonContainer}>
            <StatusButtonWrapper status={savingStatus}>
              <Button
                key="save-pipeline-button"
                variant="contained"
                color="primary"
                disabled={!owner || !consortium || savingStatus === 'pending'}
                type="submit"
              >
                Save Pipeline
              </Button>
            </StatusButtonWrapper>
          </div>
          <FormControlLabel
            control={(
              <Checkbox
                checked={pipeline.shared}
                disabled={!owner}
                onChange={evt => this.updatePipeline({ param: 'shared', value: evt.target.checked })}
              />
            )}
            label="Share this pipeline with other consortia"
            className={classes.formControl}
          />
          <Paper className={classes.tooltipPaper}>
            <Typography className={classes.tooltip} variant="body1">
              Build your pipelines by adding computation steps in the space below.
              Arrange computations vertically to determine their order from first
              (highest) to last (lowest)
            </Typography>
          </Paper>
          <div className={classes.formControl}>
            <Button
              id="computation-dropdown"
              variant="contained"
              color="primary"
              disabled={!owner}
              onClick={this.openAddComputationStepMenu}
            >
              Add Computation Step
            </Button>
            <Menu
              id="computation-menu"
              anchorEl={this.addComputationStepButtonElement}
              open={openAddComputationStepMenu}
              onClose={this.closeAddComputationStepMenu}
            >
              {sortedComputations && sortedComputations.map(comp => (
                <MenuItem
                  key={comp.id}
                  onClick={() => this.addStep(comp)}
                >
                  {comp.meta.name}
                </MenuItem>
              ))}
            </Menu>
          </div>
          <ListDeleteModal
            close={this.closeModal}
            deleteItem={this.deleteStep}
            itemName="step"
            show={showModal}
          />
          <div>
            {pipeline.steps.length > 0 && pipeline.steps.map((step, index) => (
                <PipelineStep
                  computationId={step.computations[0].id}
                  deleteStep={this.openModal}
                  eventKey={step.id}
                  id={step.id}
                  key={step.id}
                  moveStep={this.moveStep}
                  owner={owner}
                  pipelineIndex={index}
                  previousComputationIds={
                    pipeline.steps
                      .filter((_s, i) => i < index)
                      .map(s => s.computations[0].id)
                  }
                  step={step}
                  updateStep={this.updateStep}
                />
              ))
            }
          </div>
          {!pipeline.steps.length && (
            <Typography variant="body1">
              No computations added
            </Typography>
          )}
        </ValidatorForm>
      </div>
    );
  }
}

Pipeline.defaultProps = {
  activePipeline: null,
  runs: null,
  subscribeToComputations: null,
  subscribeToPipelines: null,
};

Pipeline.propTypes = {
  activePipeline: PropTypes.object,
  auth: PropTypes.object.isRequired,
  client: PropTypes.object.isRequired,
  computations: PropTypes.array.isRequired,
  connectDropTarget: PropTypes.func.isRequired,
  consortia: PropTypes.array.isRequired,
  notifySuccess: PropTypes.func.isRequired,
  notifyError: PropTypes.func.isRequired,
  params: PropTypes.object.isRequired,
  runs: PropTypes.array,
  savePipeline: PropTypes.func.isRequired,
  classes: PropTypes.object.isRequired,
};

function mapStateToProps({ auth }) {
  return { auth };
}

const PipelineWithData = compose(
  graphql(FETCH_PIPELINE_QUERY, getDocumentByParam(
    'pipelineId',
    'activePipeline',
    'fetchPipeline'
  )),
  graphql(SAVE_PIPELINE_MUTATION, saveDocumentProp('savePipeline', 'pipeline')),
  graphql(SAVE_ACTIVE_PIPELINE_MUTATION, consortiumSaveActivePipelineProp('saveActivePipeline')),
)(Pipeline);

const PipelineWithAlert = compose(
  connect(mapStateToProps),
  DragDropContext(HTML5Backend),
  DropTarget(ItemTypes.COMPUTATION, computationTarget, collect),
  withApollo
)(PipelineWithData);

const connectedComponent = connect(mapStateToProps, {
  notifySuccess,
  notifyError,
})(PipelineWithAlert);

export default withStyles(styles)(connectedComponent);
